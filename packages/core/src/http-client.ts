// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

/**
 * Logger interface for HTTP client wire logging.
 */
export interface HttpClientLogger {
  verbose(message: string): void;
  debug(message: string): void;
}

/**
 * A single error entry from the Qonto API (JSON:API format).
 */
export interface QontoApiErrorEntry {
  readonly code: string;
  readonly detail: string;
  readonly source?: {
    readonly pointer?: string;
    readonly parameter?: string;
  };
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * Structured error for Qonto API error responses (4xx/5xx).
 */
export class QontoApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errors: readonly QontoApiErrorEntry[],
  ) {
    const summary = errors.map((e) => `${e.code}: ${e.detail}`).join("; ");
    super(`Qonto API error ${status}: ${summary}`);
    this.name = "QontoApiError";
  }
}

/**
 * Error thrown when the Qonto API returns 403 due to a missing OAuth scope.
 *
 * Extends {@link QontoApiError} so existing `instanceof QontoApiError` checks
 * still match, while consumers can narrow to this subclass for targeted handling.
 */
export class QontoOAuthScopeError extends QontoApiError {
  constructor(errors: readonly QontoApiErrorEntry[]) {
    super(403, errors);
    this.name = "QontoOAuthScopeError";
  }
}

/**
 * Error thrown when all retry attempts are exhausted on 429 responses.
 */
export class QontoRateLimitError extends Error {
  constructor(public readonly retryAfter: number | undefined) {
    super(`Rate limit exceeded${retryAfter !== undefined ? ` (retry after ${retryAfter}s)` : ""}`);
    this.name = "QontoRateLimitError";
  }
}

/**
 * Error thrown when the Qonto API requires Strong Customer Authentication (428).
 *
 * The SCA session token can be used to poll the SCA session status and
 * retry the original request once approved. The token is intentionally
 * omitted from `.message` to avoid leaking it through generic error
 * logging; callers needing the token can read `.scaSessionToken` directly.
 */
export class QontoScaRequiredError extends Error {
  constructor(public readonly scaSessionToken: string) {
    super(`SCA required`);
    this.name = "QontoScaRequiredError";
  }
}

/**
 * Authorization value: either a static string or a function that resolves
 * the authorization header dynamically (e.g., for OAuth auto-refresh).
 */
export type Authorization = string | (() => string | Promise<string>);

/**
 * Callback invoked when fallback authorization is used after a 401/403.
 * Receives the HTTP method and path of the retried request.
 */
export type FallbackWarningHandler = (method: string, path: string) => void;

export interface HttpClientOptions {
  /** Base URL for API requests. */
  readonly baseUrl: string;

  /** Value for the Authorization header, or a function that resolves it dynamically. */
  readonly authorization: Authorization;

  /** Fallback authorization used when the primary returns 401/403. */
  readonly fallbackAuthorization?: Authorization | undefined;

  /** Called when fallback authorization is used. */
  readonly onFallback?: FallbackWarningHandler | undefined;

  /** Logger for verbose/debug output. */
  readonly logger?: HttpClientLogger | undefined;

  /** Maximum number of retries on 429 responses. Defaults to 5. */
  readonly maxRetries?: number | undefined;

  /**
   * SCA method preference for write requests. Sent verbatim as the
   * `X-Qonto-2fa-Preference` header (omitted when undefined). Production
   * accepts `paired-device`, `passkey`, `sms-otp`; sandbox additionally
   * accepts `mock`. The default-resolution policy (sandbox auto-default,
   * env, config) lives in `resolveScaMethod`; this field is a raw transport
   * option.
   */
  readonly scaMethod?: string | undefined;

  /** Staging token sent as `X-Qonto-Staging-Token` to route requests to the sandbox environment. */
  readonly stagingToken?: string | undefined;
}

const DEFAULT_MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;

/**
 * HTTP methods that represent write operations and require an idempotency key.
 */
const WRITE_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Header name for the Qonto idempotency key.
 */
const IDEMPOTENCY_KEY_HEADER = "X-Qonto-Idempotency-Key";

/**
 * Header name for the SCA method preference.
 */
const SCA_METHOD_HEADER = "X-Qonto-2fa-Preference";

/**
 * Header name for the SCA session token (used on retry after SCA approval).
 */
const SCA_SESSION_TOKEN_HEADER = "X-Qonto-Sca-Session-Token";

/**
 * Header name for the staging token (routes requests to sandbox).
 */
const STAGING_TOKEN_HEADER = "X-Qonto-Staging-Token";

/**
 * Field and header names redacted from debug log output.
 *
 * Covers two classes of secrets:
 * - Financial data (IBAN, BIC, balances) that must not appear in logs.
 * - Authentication and SCA tokens that grant API access if leaked.
 *
 * Header names are stored lowercase; matching is case-insensitive so the
 * same set redacts both body fields (snake_case) and HTTP header names
 * (which arrive in mixed case from `Headers` / our own builders).
 */
const SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  // Financial body fields
  "iban",
  "bic",
  "balance",
  "balance_cents",
  "authorized_balance",
  "authorized_balance_cents",
  // SCA session token (body field and header form)
  "sca_session_token",
  "x-qonto-sca-session-token",
  // Authentication and environment headers
  "authorization",
  "x-qonto-staging-token",
]);

function redactSensitiveFields(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => redactSensitiveFields(item));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_FIELDS.has(key.toLowerCase()) ? "[REDACTED]" : redactSensitiveFields(val);
    }
    return result;
  }
  return value;
}

function buildUserAgent(): string {
  return `QontoCtl/${packageJson.version} (Node.js/${process.versions.node}; ${process.platform})`;
}

/**
 * Query parameter value: a single string or an array of strings for
 * repeated-key parameters (e.g., `status[]=pending&status[]=completed`).
 */
export type QueryParamValue = string | readonly string[];

/**
 * Query parameters for an HTTP request.
 */
export type QueryParams = Readonly<Record<string, QueryParamValue>>;

/**
 * Core HTTP client for the Qonto API.
 *
 * Features:
 * - Configurable base URL (production/sandbox)
 * - User-Agent header on all requests
 * - Exponential backoff on 429 responses
 * - Structured error handling for 4xx/5xx
 * - Wire logging (verbose/debug) via injected logger
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly authorization: Authorization;
  private readonly fallbackAuthorization: Authorization | undefined;
  private readonly onFallback: FallbackWarningHandler | undefined;
  private readonly logger: HttpClientLogger | undefined;
  private readonly maxRetries: number;
  private readonly scaMethod: string | undefined;
  private readonly stagingToken: string | undefined;
  private readonly userAgent: string;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.authorization = options.authorization;
    this.fallbackAuthorization = options.fallbackAuthorization;
    this.onFallback = options.onFallback;
    this.logger = options.logger;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.scaMethod = options.scaMethod;
    this.stagingToken = options.stagingToken;
    this.userAgent = buildUserAgent();
  }

  /**
   * Whether this client is configured for the Qonto sandbox environment.
   *
   * True when a staging token is set, which routes requests through the
   * sandbox host via the `X-Qonto-Staging-Token` header. Sandbox-only
   * operations (e.g. `mockScaDecision`) should gate on this flag.
   */
  get isSandbox(): boolean {
    return this.stagingToken !== undefined;
  }

  /**
   * Sends an HTTP request and parses the response as JSON.
   *
   * **Trust boundary**: The parsed JSON is cast to `T` without runtime validation.
   * Callers trust the Qonto API contract for response shapes.
   */
  async request<T>(
    method: string,
    path: string,
    options?: {
      readonly body?: unknown;
      readonly params?: QueryParams;
      readonly idempotencyKey?: string;
      readonly scaSessionToken?: string;
    },
  ): Promise<T> {
    const response = await this.fetchWithRetry(method, path, options);
    const responseBody: unknown = await response.json();
    this.logDebug(`Response body: ${JSON.stringify(redactSensitiveFields(responseBody))}`);
    return responseBody as T;
  }

  /**
   * Sends an HTTP request expecting no response body (e.g. 204 No Content).
   */
  async requestVoid(
    method: string,
    path: string,
    options?: {
      readonly body?: unknown;
      readonly params?: QueryParams;
      readonly idempotencyKey?: string;
      readonly scaSessionToken?: string;
    },
  ): Promise<void> {
    await this.fetchWithRetry(method, path, options);
  }

  /**
   * Sends an HTTP request and returns the response body as a Buffer.
   *
   * Used for binary endpoints (e.g. PDF downloads) where JSON parsing
   * is not appropriate.
   */
  async requestBuffer(
    method: string,
    path: string,
    options?: {
      readonly params?: QueryParams;
    },
  ): Promise<Buffer> {
    const response = await this.fetchWithRetry(method, path, { ...options, accept: "application/octet-stream" });
    const arrayBuffer = await response.arrayBuffer();
    this.logDebug(`Response body: <binary ${arrayBuffer.byteLength} bytes>`);
    return Buffer.from(arrayBuffer);
  }

  async get<T>(path: string, params?: QueryParams): Promise<T> {
    return this.request<T>("GET", path, params !== undefined ? { params } : undefined);
  }

  async post<T>(
    path: string,
    body?: unknown,
    options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
  ): Promise<T> {
    return this.request<T>("POST", path, {
      ...(body !== undefined ? { body } : {}),
      ...options,
    });
  }

  async getBuffer(path: string, params?: QueryParams): Promise<Buffer> {
    return this.requestBuffer("GET", path, params !== undefined ? { params } : undefined);
  }

  async put<T>(
    path: string,
    body?: unknown,
    options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
  ): Promise<T> {
    return this.request<T>("PUT", path, {
      ...(body !== undefined ? { body } : {}),
      ...options,
    });
  }

  async patch<T>(
    path: string,
    body?: unknown,
    options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
  ): Promise<T> {
    return this.request<T>("PATCH", path, {
      ...(body !== undefined ? { body } : {}),
      ...options,
    });
  }

  async delete(
    path: string,
    options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
  ): Promise<void> {
    return this.requestVoid("DELETE", path, options);
  }

  /**
   * Sends a multipart form-data POST request and parses the response as JSON.
   *
   * Unlike `post()`, this does NOT set `Content-Type` — the runtime sets it
   * automatically with the correct multipart boundary.
   */
  async postFormData<T>(
    path: string,
    formData: FormData,
    options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
  ): Promise<T> {
    const response = await this.fetchWithRetry("POST", path, {
      formData,
      ...options,
    });
    const responseBody: unknown = await response.json();
    this.logDebug(`Response body: ${JSON.stringify(redactSensitiveFields(responseBody))}`);
    return responseBody as T;
  }

  private async fetchWithRetry(
    method: string,
    path: string,
    options?: {
      readonly body?: unknown;
      readonly formData?: FormData;
      readonly params?: QueryParams;
      readonly idempotencyKey?: string;
      readonly scaSessionToken?: string;
      readonly accept?: string;
    },
  ): Promise<Response> {
    const url = this.buildUrl(path, options?.params);
    const isFormData = options?.formData !== undefined;
    const body: string | FormData | undefined = isFormData
      ? options.formData
      : options?.body !== undefined
        ? JSON.stringify(options.body)
        : undefined;
    const isWrite = WRITE_METHODS.has(method.toUpperCase());
    const idempotencyKey = isWrite ? (options?.idempotencyKey ?? randomUUID()) : undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const headers = await this.buildHeaders(!isFormData && options?.body !== undefined, options?.accept);

      if (idempotencyKey !== undefined) {
        headers[IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
      }

      if (isWrite && this.scaMethod !== undefined) {
        headers[SCA_METHOD_HEADER] = this.scaMethod;
      }

      if (options?.scaSessionToken !== undefined) {
        headers[SCA_SESSION_TOKEN_HEADER] = options.scaSessionToken;
      }

      this.logVerbose(`${method} ${url.toString()}${attempt > 0 ? ` (retry ${attempt})` : ""}`);
      if (body !== undefined) {
        this.logDebug(isFormData ? "Request body: [FormData]" : `Request body: ${body as string}`);
      }

      const startTime = performance.now();
      const response = await fetch(url, body !== undefined ? { method, headers, body } : { method, headers });
      const elapsed = performance.now() - startTime;

      this.logVerbose(`${response.status} ${response.statusText} (${elapsed.toFixed(0)}ms)`);
      this.logDebug(
        `Response headers: ${JSON.stringify(redactSensitiveFields(Object.fromEntries(response.headers.entries())))}`,
      );

      if (response.status === 429) {
        const retryAfter = this.parseRetryAfter(response);

        if (attempt === this.maxRetries) {
          throw new QontoRateLimitError(retryAfter);
        }

        const delay = retryAfter !== undefined ? retryAfter * 1000 : BASE_BACKOFF_MS * Math.pow(2, attempt);
        this.logVerbose(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}`);
        await this.sleep(delay);
        continue;
      }

      if (response.status === 428) {
        const errorBody = await this.safeReadJson(response);
        const scaToken = this.extractScaSessionToken(errorBody);
        throw new QontoScaRequiredError(scaToken);
      }

      if ((response.status === 401 || response.status === 403) && this.fallbackAuthorization !== undefined) {
        const primaryErrorBody = await this.safeReadJson(response);
        const primaryErrors = this.extractErrors(primaryErrorBody);

        this.logDebug(`Primary auth error response body: ${JSON.stringify(redactSensitiveFields(primaryErrorBody))}`);

        if (!this.isAuthError(primaryErrors)) {
          this.logVerbose(`${response.status} error is not auth-related, propagating primary error`);
          throw new QontoApiError(response.status, primaryErrors);
        }

        this.logVerbose(`${response.status} with primary auth, retrying with fallback authorization`);
        this.onFallback?.(method, path);

        const fallbackHeaders = await this.buildHeaders(
          !isFormData && options?.body !== undefined,
          options?.accept,
          this.fallbackAuthorization,
        );

        if (idempotencyKey !== undefined) {
          fallbackHeaders[IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
        }

        if (isWrite && this.scaMethod !== undefined) {
          fallbackHeaders[SCA_METHOD_HEADER] = this.scaMethod;
        }

        if (options?.scaSessionToken !== undefined) {
          fallbackHeaders[SCA_SESSION_TOKEN_HEADER] = options.scaSessionToken;
        }

        this.logVerbose(`${method} ${url.toString()} (fallback)`);

        const fallbackStart = performance.now();
        const fallbackResponse = await fetch(
          url,
          body !== undefined ? { method, headers: fallbackHeaders, body } : { method, headers: fallbackHeaders },
        );
        const fallbackElapsed = performance.now() - fallbackStart;

        this.logVerbose(`${fallbackResponse.status} ${fallbackResponse.statusText} (${fallbackElapsed.toFixed(0)}ms)`);
        this.logDebug(
          `Response headers: ${JSON.stringify(redactSensitiveFields(Object.fromEntries(fallbackResponse.headers.entries())))}`,
        );

        if (fallbackResponse.status === 428) {
          const errorBody = await this.safeReadJson(fallbackResponse);
          const scaToken = this.extractScaSessionToken(errorBody);
          throw new QontoScaRequiredError(scaToken);
        }

        if (!fallbackResponse.ok) {
          const errorBody = await this.safeReadJson(fallbackResponse);
          const errors: readonly QontoApiErrorEntry[] = this.extractErrors(errorBody);
          throw new QontoApiError(fallbackResponse.status, errors);
        }

        return fallbackResponse;
      }

      if (!response.ok) {
        const errorBody = await this.safeReadJson(response);
        const errors: readonly QontoApiErrorEntry[] = this.extractErrors(errorBody);

        if (
          response.status === 403 &&
          errors.some((e) => e.detail.toLowerCase().includes("missing required oauth scope"))
        ) {
          throw new QontoOAuthScopeError(errors);
        }

        throw new QontoApiError(response.status, errors);
      }

      return response;
    }

    // Unreachable in practice: the loop always returns or throws
    throw new QontoRateLimitError(undefined);
  }

  private buildUrl(path: string, params?: QueryParams): URL {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === "string") {
          url.searchParams.set(key, value);
        } else {
          for (const v of value) {
            url.searchParams.append(key, v);
          }
        }
      }
    }
    return url;
  }

  private async buildHeaders(
    hasBody: boolean,
    accept?: string,
    authOverride?: Authorization,
  ): Promise<Record<string, string>> {
    const authSource = authOverride ?? this.authorization;
    const authorization = typeof authSource === "function" ? await authSource() : authSource;

    const headers: Record<string, string> = {
      Authorization: authorization,
      "User-Agent": this.userAgent,
      Accept: accept ?? "application/json",
    };

    if (hasBody) {
      headers["Content-Type"] = "application/json";
    }

    if (this.stagingToken !== undefined) {
      headers[STAGING_TOKEN_HEADER] = this.stagingToken;
    }

    this.logDebug(`Request headers: ${JSON.stringify(redactSensitiveFields(headers))}`);

    return headers;
  }

  private parseRetryAfter(response: Response): number | undefined {
    const header = response.headers.get("Retry-After");
    if (header === null) {
      return undefined;
    }
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
  }

  private extractScaSessionToken(body: unknown): string {
    if (
      typeof body === "object" &&
      body !== null &&
      "sca_session_token" in body &&
      typeof (body as { sca_session_token: unknown }).sca_session_token === "string"
    ) {
      return (body as { sca_session_token: string }).sca_session_token;
    }
    return "unknown";
  }

  private isAuthError(errors: readonly QontoApiErrorEntry[]): boolean {
    const authPattern = /\b(unauthorized|forbidden|unauthenticated|authentication|authorization|oauth)\b/i;
    return errors.some((e) => authPattern.test(e.code) || authPattern.test(e.detail));
  }

  private extractErrors(body: unknown): readonly QontoApiErrorEntry[] {
    if (
      typeof body === "object" &&
      body !== null &&
      "errors" in body &&
      Array.isArray((body as { errors: unknown }).errors)
    ) {
      return (body as { errors: unknown[] }).errors.map((entry: unknown) => {
        const e = entry as Record<string, unknown>;
        const base = {
          code: typeof e["code"] === "string" ? e["code"] : "unknown",
          detail: typeof e["detail"] === "string" ? e["detail"] : "Unknown error",
        };
        const source =
          typeof e["source"] === "object" && e["source"] !== null
            ? { source: e["source"] as QontoApiErrorEntry["source"] }
            : {};
        const meta =
          typeof e["meta"] === "object" && e["meta"] !== null ? { meta: e["meta"] as QontoApiErrorEntry["meta"] } : {};
        return { ...base, ...source, ...meta } as QontoApiErrorEntry;
      });
    }
    return [{ code: "unknown", detail: "Unknown error" }];
  }

  private async safeReadJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  private logVerbose(message: string): void {
    this.logger?.verbose(message);
  }

  private logDebug(message: string): void {
    this.logger?.debug(message);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
