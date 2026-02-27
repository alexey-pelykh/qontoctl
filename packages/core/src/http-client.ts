// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

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
 * Error thrown when all retry attempts are exhausted on 429 responses.
 */
export class QontoRateLimitError extends Error {
  constructor(public readonly retryAfter: number | undefined) {
    super(`Rate limit exceeded${retryAfter !== undefined ? ` (retry after ${retryAfter}s)` : ""}`);
    this.name = "QontoRateLimitError";
  }
}

export interface HttpClientOptions {
  /** Base URL for API requests. */
  readonly baseUrl: string;

  /** Value for the Authorization header. */
  readonly authorization: string;

  /**
   * Staging token for sandbox mode.
   * When set, the `X-Qonto-Staging-Token` header is included.
   */
  readonly stagingToken?: string | undefined;

  /** Logger for verbose/debug output. */
  readonly logger?: HttpClientLogger | undefined;

  /** Maximum number of retries on 429 responses. Defaults to 5. */
  readonly maxRetries?: number | undefined;
}

const DEFAULT_MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;

function buildUserAgent(): string {
  return `QontoCtl/0.0.0 (Node.js/${process.versions.node}; ${process.platform})`;
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
 * - Sandbox mode with X-Qonto-Staging-Token header
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly authorization: string;
  private readonly stagingToken: string | undefined;
  private readonly logger: HttpClientLogger | undefined;
  private readonly maxRetries: number;
  private readonly userAgent: string;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.authorization = options.authorization;
    this.stagingToken = options.stagingToken;
    this.logger = options.logger;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.userAgent = buildUserAgent();
  }

  async request<T>(
    method: string,
    path: string,
    options?: {
      readonly body?: unknown;
      readonly params?: QueryParams;
    },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const headers = this.buildHeaders(options?.body !== undefined);
    const body = options?.body !== undefined ? JSON.stringify(options.body) : undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      this.logVerbose(`${method} ${url.toString()}${attempt > 0 ? ` (retry ${attempt})` : ""}`);
      if (body !== undefined) {
        this.logDebug(`Request body: ${body}`);
      }

      const startTime = performance.now();
      const response = await fetch(url, body !== undefined ? { method, headers, body } : { method, headers });
      const elapsed = performance.now() - startTime;

      this.logVerbose(`${response.status} ${response.statusText} (${elapsed.toFixed(0)}ms)`);
      this.logDebug(`Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);

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

      if (!response.ok) {
        const errorBody = await this.safeReadJson(response);
        const errors: readonly QontoApiErrorEntry[] = this.extractErrors(errorBody);
        throw new QontoApiError(response.status, errors);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const responseBody: unknown = await response.json();
      this.logDebug(`Response body: ${JSON.stringify(responseBody)}`);
      return responseBody as T;
    }

    // Unreachable in practice: the loop always returns or throws
    throw new QontoRateLimitError(undefined);
  }

  async get<T>(path: string, params?: QueryParams): Promise<T> {
    return this.request<T>("GET", path, params !== undefined ? { params } : undefined);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body !== undefined ? { body } : undefined);
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

  private buildHeaders(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: this.authorization,
      "User-Agent": this.userAgent,
      Accept: "application/json",
    };

    if (hasBody) {
      headers["Content-Type"] = "application/json";
    }

    if (this.stagingToken !== undefined) {
      headers["X-Qonto-Staging-Token"] = this.stagingToken;
    }

    this.logDebug(`Request headers: ${JSON.stringify({ ...headers, Authorization: "[REDACTED]" })}`);

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

  private extractErrors(body: unknown): readonly QontoApiErrorEntry[] {
    if (
      typeof body === "object" &&
      body !== null &&
      "errors" in body &&
      Array.isArray((body as { errors: unknown }).errors)
    ) {
      return (body as { errors: QontoApiErrorEntry[] }).errors;
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
