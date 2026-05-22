// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { OAuthNoTokenError } from "./auth/oauth.js";
import { OAuthRefreshError } from "./auth/oauth-service.js";

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
 * Error thrown when the Qonto API returns 428 because the account has not
 * enrolled in SCA.
 *
 * Distinct from {@link QontoScaRequiredError}: this is a configuration error,
 * not a recoverable challenge. No SCA session token is issued, polling cannot
 * resolve it, and retries with the same auth will return the same 428. The
 * caller must enroll SCA on the Qonto account before retrying.
 *
 * Extends {@link QontoApiError} so existing `instanceof QontoApiError` checks
 * still match while consumers can narrow to this subclass for targeted
 * handling. Deliberately does NOT extend {@link QontoScaRequiredError}, so
 * SCA-handling helpers (e.g., `executeWithSca`) propagate it instead of
 * attempting to poll a non-existent SCA session.
 */
export class QontoScaNotEnrolledError extends QontoApiError {
  constructor(errors: readonly QontoApiErrorEntry[]) {
    super(428, errors);
    this.name = "QontoScaNotEnrolledError";
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
 * Covers three classes of sensitive data:
 * - Financial data (IBAN, BIC, balances) that must not appear in logs.
 * - Authentication and SCA tokens that grant API access if leaked.
 * - Personally identifiable information (PII) carried in request and
 *   response bodies:
 *   - Recipient and contact emails — the `send_to` array on quote /
 *     client-invoice send endpoints (#637-#639) and the singular `email`
 *     field on beneficiaries, clients, and memberships (#644).
 *   - Natural-person identification fields on `Client`,
 *     `ClientInvoiceClient`, `QuoteClient`, and `CreditNoteClient` —
 *     `first_name`, `last_name`, `tax_identification_number`,
 *     `phone_number`, and the address components (`address`,
 *     `street_address`, `city`, `zip_code`, `country_code`,
 *     `province_code`). The `name` field of a corporate entity and
 *     `vat_number` are intentionally NOT in this set — they are
 *     visible-by-design for operational debugging of B2B records; a
 *     judgment call documented at #647.
 *
 * Matching is exact-name (case-insensitive); header names stored
 * lowercase. Exact-name semantics mean future schema additions with
 * synonyms (e.g., `email_address` for `email`, `tax_id` for
 * `tax_identification_number`) would skip redaction silently — the
 * trade-off vs an allowlist-of-safe-fields + catch-all design is logged
 * as a security LOW finding in the #645 / #647 review chain and may
 * evolve in a future PR.
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
  // PII: recipient and contact emails (#644)
  "send_to",
  "email",
  // PII: natural-person identification fields (#647)
  "first_name",
  "last_name",
  "tax_identification_number",
  "phone_number",
  // PII: address components — top-level (`address`) and nested
  // (`street_address`, `city`, `zip_code`, `country_code`,
  // `province_code`) on `Client.billing_address` / `delivery_address`
  // and equivalents on `ClientInvoiceClient`, `QuoteClient`,
  // `CreditNoteClient` (#647)
  "address",
  "street_address",
  "city",
  "zip_code",
  "country_code",
  "province_code",
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
   * Whether this client is configured for the sandbox mock SCA path.
   *
   * True when both:
   *   - {@link isSandbox} is true (staging token configured), AND
   *   - The resolved `scaMethod` is `"mock"` (sandbox-only auto-default or
   *     explicit preference)
   *
   * Used by CLI/MCP wrappers to disambiguate spinner copy ("mock-decision"
   * vs "mobile app") and to gate the sandbox-only `--sca-auto-approve`
   * auto-default behavior. Production clients always return false here, so
   * sandbox-only behavior cannot accidentally engage in production.
   */
  get isMockSca(): boolean {
    return this.isSandbox && this.scaMethod === "mock";
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
      // Track whether we already advanced to the fallback authorization for THIS
      // attempt. Two paths feed it:
      //   1. Auth-flow failure (e.g. OAuth refresh `invalid_grant`): caught
      //      pre-fetch and retried by re-building headers with the fallback.
      //   2. HTTP-level 401/403 fallback (existing behavior, gated below by
      //      `!usingFallback`).
      //
      // The flag exists so the 401/403 path does not re-trigger after we have
      // already used the fallback for this attempt — that would call api-key
      // a second time on a path-level rejection and swallow the legitimate
      // error class.
      let usingFallback = false;
      let headers: Record<string, string>;

      try {
        headers = await this.buildHeaders(!isFormData && options?.body !== undefined, options?.accept);
      } catch (err) {
        // Auth-flow failures are recognized via two typed error classes so
        // they can advance to the fallback authorization the same way an
        // HTTP 401 would:
        //
        //   1. `OAuthRefreshError` — OAuth refresh-token expiry or network
        //      failure during refresh (the #523 case). Without this branch,
        //      a refresh failure would short-circuit out of the request
        //      entirely.
        //
        //   2. `OAuthNoTokenError` — OAuth credentials configured but no
        //      access token present at request time (the #631 case — user
        //      has set up `oauth.client-id`/`client-secret` but never ran
        //      `qontoctl auth login`). Without this branch, the typed error
        //      thrown by `buildOAuthAuthorization` would propagate fatally
        //      even when the user has api-key creds that should serve as
        //      the wired fallback under `oauth-first`.
        //
        // Critical: we ONLY catch these specific typed classes here. A
        // generic `AuthError` (the parent class) or any other throw still
        // propagates so we never silently mask a misconfigured api-key
        // (e.g. empty `secret-key` raises plain `AuthError` from
        // `buildApiKeyAuthorization` — that is a configuration problem the
        // user must see, not a fallback trigger). The security-architect
        // invariant from #631's `/council` deliberation: a user who
        // explicitly asked for a specific credential type must see auth-
        // configuration errors, not silent degradation.
        const isFallbackTrigger = err instanceof OAuthRefreshError || err instanceof OAuthNoTokenError;
        if (isFallbackTrigger && this.fallbackAuthorization !== undefined) {
          const errName = err instanceof OAuthRefreshError ? "refresh" : "no-token";
          this.logVerbose(`OAuth ${errName} (${err.message}); advancing to fallback authorization`);
          this.onFallback?.(method, path);
          usingFallback = true;
          headers = await this.buildHeaders(
            !isFormData && options?.body !== undefined,
            options?.accept,
            this.fallbackAuthorization,
          );
        } else {
          throw err;
        }
      }

      if (idempotencyKey !== undefined) {
        headers[IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
      }

      if (isWrite && this.scaMethod !== undefined) {
        headers[SCA_METHOD_HEADER] = this.scaMethod;
      }

      if (options?.scaSessionToken !== undefined) {
        headers[SCA_SESSION_TOKEN_HEADER] = options.scaSessionToken;
      }

      this.logVerbose(
        `${method} ${url.toString()}${attempt > 0 ? ` (retry ${attempt})` : ""}${usingFallback ? " (fallback)" : ""}`,
      );
      this.logDebug(`Request headers: ${JSON.stringify(redactSensitiveFields(headers))}`);
      if (body !== undefined) {
        // Redact request body for debug logging only — `body` (the
        // stringified form sent to fetch) stays untouched. FormData
        // requests are logged as a placeholder because their parts may be
        // binary and are not JSON-redactable.
        this.logDebug(
          isFormData
            ? "Request body: [FormData]"
            : `Request body: ${JSON.stringify(redactSensitiveFields(options?.body))}`,
        );
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
        throw this.build428Error(errorBody);
      }

      if (
        (response.status === 401 || response.status === 403) &&
        this.fallbackAuthorization !== undefined &&
        !usingFallback
      ) {
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
        this.logDebug(`Request headers: ${JSON.stringify(redactSensitiveFields(fallbackHeaders))}`);

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
          throw this.build428Error(errorBody);
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

  /**
   * Discriminate between the two 428 response shapes the Qonto API returns:
   *
   * - `sca_required` — body contains `sca_session_token` (recoverable: poll +
   *   retry). Yields {@link QontoScaRequiredError}.
   * - `sca_not_enrolled` — body contains top-level `code: "sca_not_enrolled"`
   *   (flat shape) or a JSON:API `errors[]` entry with that code. No session
   *   token is issued; this is a configuration error and the caller must
   *   enroll SCA on the Qonto account before retrying. Yields
   *   {@link QontoScaNotEnrolledError}.
   *
   * Unknown 428 shapes fall back to a generic {@link QontoApiError} carrying
   * the JSON:API `errors[]` code/detail when present, otherwise a sentinel
   * `[{ code: "unknown", detail: "Unknown error" }]` entry. This avoids
   * fabricating a `"unknown"` SCA session token that callers would send back
   * to Qonto on retry, which Qonto rejects with a confusing follow-up error.
   */
  private build428Error(body: unknown): QontoScaRequiredError | QontoScaNotEnrolledError | QontoApiError {
    if (typeof body === "object" && body !== null) {
      const obj = body as Record<string, unknown>;

      if (typeof obj["sca_session_token"] === "string") {
        return new QontoScaRequiredError(obj["sca_session_token"]);
      }

      if (obj["code"] === "sca_not_enrolled") {
        const detail = typeof obj["message"] === "string" ? obj["message"] : "SCA not enrolled";
        return new QontoScaNotEnrolledError([{ code: "sca_not_enrolled", detail }]);
      }

      if (Array.isArray(obj["errors"])) {
        const errors = this.extractErrors(body);
        if (errors.some((e) => e.code === "sca_not_enrolled")) {
          return new QontoScaNotEnrolledError(errors);
        }
      }
    }

    return new QontoApiError(428, this.extractErrors(body));
  }

  private isAuthError(errors: readonly QontoApiErrorEntry[]): boolean {
    const authPattern = /\b(unauthorized|forbidden|unauthenticated|authentication|authorization|oauth)\b/i;
    return errors.some((e) => authPattern.test(e.code) || authPattern.test(e.detail));
  }

  private extractErrors(body: unknown): readonly QontoApiErrorEntry[] {
    if (typeof body === "object" && body !== null && "errors" in body && Array.isArray(body.errors)) {
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
