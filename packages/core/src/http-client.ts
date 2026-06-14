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
 * Field and header names whose leaf values are safe to emit verbatim in
 * debug-log output. Every primitive leaf whose key is NOT in this set is
 * replaced with `[REDACTED]` by {@link redactSensitiveFields}.
 *
 * ## Why an allowlist (and not a denylist)
 *
 * Redaction previously used a `SENSITIVE_FIELDS` *denylist*: named fields were
 * masked, every other value was logged verbatim. That model fails OPEN — any
 * future Qonto schema field with a synonym of an already-sensitive name
 * (`email_address` for `email`, `tax_id` for `tax_identification_number`,
 * `phone` / `mobile` for `phone_number`, …) would silently skip redaction and
 * leak PII into debug logs, with nothing in code or tests to flag it. The
 * denylist had to be manually chased on every API-surface change.
 *
 * Issue #650 weighed three replacements:
 *
 *   - **A — allowlist + catch-all redaction (this design).** Enumerate the
 *     small set of provably-non-sensitive keys; redact every other leaf. New
 *     schema fields are redacted *by default*. The failure mode inverts from
 *     "a PII field leaks silently" (invisible, dangerous) to "a safe field is
 *     over-redacted" (a visible test failure, harmless). Fails CLOSED.
 *   - **B — hybrid denylist + PII-shaped-key heuristics** (`/email/i`,
 *     `/phone/i`, …). Rejected: still fails OPEN for any PII field whose key
 *     does not match a hardcoded pattern (`ssn`, `national_id`,
 *     `date_of_birth`, `passport_number`, …). It narrows the gap but does not
 *     close the silent-leak class #650 exists to eliminate.
 *   - **C — value-shape heuristics** (redact values shaped like emails /
 *     IBANs / phone numbers). Rejected: cannot cover non-shaped PII — names,
 *     cities, zip codes (the natural-person surface #647 protects) have no
 *     recognizable value shape — and risks false positives on reference codes.
 *
 * Option A was chosen: it is the only design that makes redaction the default
 * and converts the dangerous invisible failure mode into a safe visible one.
 *
 * ## The over-redaction trade-off
 *
 * Catch-all redaction makes debug logs terser. This allowlist therefore keeps
 * genuinely-operational, never-PII keys readable so debugging does not
 * regress: resource identity and lifecycle fields (`id`, `kind`, `status`,
 * timestamps), money metadata (`amount`, `currency`), and the HTTP transport
 * headers that carry no secret. It also preserves the visible-by-design
 * carve-out from #647 for a business's `vat_number` — a corporate tax
 * identifier with no natural-person analog (an individual's personal tax id is
 * `tax_identification_number`, which is absent from this set and therefore
 * redacted), so it stays globally readable for operational debugging of B2B
 * records.
 *
 * ## `name` is gated per-object, not globally loggable (#653)
 *
 * `name` is deliberately NOT in this set. A corporate entity's `name` is safe
 * to log, but the same key holds a *natural person* on records that decompose
 * differently — a SEPA / international beneficiary or an inline transfer
 * beneficiary (the account holder, frequently an individual), or an
 * `individual` / `freelancer` client (which the API may return with `name`
 * populated rather than `first_name` / `last_name`). A single global `name`
 * entry failed the same way the old denylist did: one rule spanning
 * heterogeneous semantics across endpoint families, leaking the person cases.
 *
 * Instead {@link redactNode} keeps `name` readable only when the *same object*
 * asserts a corporate identity in its own keys — `kind === "company"` or
 * `type === "company"` (the discriminator the `Client` / `QuoteClient` /
 * `ClientInvoiceClient` / `CreditNoteClient` schemas carry). The marker is
 * re-evaluated at every object level, so a corporate holder never vouches for
 * a `name` nested beneath it (e.g. a `contact.name`). Everything else fails
 * closed: beneficiaries, individual / freelancer clients, organizations,
 * teams, labels, and bank-account nicknames all redact `name`, while their
 * `id` / `slug` / `status` keep the record identifiable in logs. The
 * discriminator value is compared case-insensitively; its keys are read per
 * Qonto's documented lowercase `kind` / `type` contract (a non-lowercase key
 * would simply fail closed and over-redact `name`). Accepted residual: a
 * record that simultaneously asserts `kind: "company"` and carries a
 * natural-person `name` in the same object would log that name — no documented
 * Qonto shape does this, and the record is the caller's own outbound data.
 *
 * Adding a key here is a deliberate, reviewable assertion that the field is
 * safe to log — the inverse of the old denylist, where *forgetting* to add a
 * field was a silent leak. When in doubt, leave a key out: the cost is a
 * terse debug line, not a PII leak.
 *
 * Matching is exact-name and case-insensitive; HTTP header names are compared
 * lowercase.
 */
const LOGGABLE_FIELDS: ReadonlySet<string> = new Set([
  // Resource identity, classification, and lifecycle — opaque identifiers,
  // enumerations, and timestamps. Never PII; the backbone of a useful log.
  "id",
  "slug",
  "kind",
  "status",
  "created_at",
  "updated_at",
  // Money metadata — the magnitude and currency of the operation in hand
  // (the caller already knows these). Standing `balance` fields are NOT
  // listed and therefore stay redacted.
  "amount",
  "currency",
  // Localization.
  "locale",
  // Non-sensitive operational flags.
  "copy_to_self",
  // Entity-kind discriminator (`individual` / `company` / `freelancer`) — an
  // enum, never PII; allowlisted so the per-object `name` gate's decision
  // stays auditable in the log (#653). (`kind`, its synonym, is already
  // allowlisted above as a classification field.)
  "type",
  // Business tax identifier, visible-by-design for operational debugging of
  // B2B records — corporate-only by definition, no natural-person analog
  // (carve-out established at #647). `name` is intentionally NOT here: it is
  // gated per-object in `redactNode`, not globally loggable (#653).
  "vat_number",
  // HTTP transport headers known to carry no secret or PII (compared
  // lowercase). The sensitive request headers — `authorization`,
  // `x-qonto-staging-token`, `x-qonto-sca-session-token` — are deliberately
  // absent and therefore redacted.
  "user-agent",
  "accept",
  "content-type",
  "content-length",
  "date",
  "etag",
  "x-request-id",
  "x-qonto-idempotency-key",
  "x-qonto-2fa-preference",
]);

/**
 * Returns a redacted deep copy of `value` for safe debug-log emission: every
 * primitive leaf whose key is not in {@link LOGGABLE_FIELDS} is replaced with
 * `[REDACTED]`. The `name` key is the one exception — gated per-object on a
 * corporate-entity marker rather than globally allowlisted (see
 * {@link isCorporateEntity} and the {@link LOGGABLE_FIELDS} note, #653).
 *
 * The walk always descends through objects and arrays, so the *structure* of
 * the payload stays visible — only leaf values are masked. An object's
 * properties are each judged by their own key; an array inherits the
 * redaction decision of the key that holds it (its elements have no key of
 * their own), so e.g. `send_to: ["a@x.com", "b@x.com"]` logs as
 * `send_to: ["[REDACTED]", "[REDACTED]"]`. `null` leaves are kept as-is —
 * they carry nothing to leak. A top-level primitive input — one with no key
 * to vouch for it — is redacted as well, in keeping with the fail-closed
 * default; in practice the call sites only ever pass objects.
 *
 * The input is never mutated. Every debug-log call site shares this one
 * function by reference — the five categories (request body, response body,
 * request headers, response headers, primary-auth-error body), with the
 * header pair recurring on the fallback-auth path — so redaction, including
 * the per-object `name` gate, applies uniformly across all of them.
 */
function redactSensitiveFields(value: unknown): unknown {
  return redactNode(value, true);
}

/**
 * Recursive worker for {@link redactSensitiveFields}.
 *
 * @param redactLeaf - whether a primitive `value` should be redacted. Set by
 *   the holding key's {@link LOGGABLE_FIELDS} membership and inherited by
 *   array elements (which have no key of their own).
 */
function redactNode(value: unknown, redactLeaf: boolean): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => redactNode(item, redactLeaf));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // `name` is loggable only when THIS object asserts a corporate identity in
    // its own keys — re-evaluated per object so a corporate holder never
    // vouches for a `name` nested beneath it (#653). See {@link LOGGABLE_FIELDS}.
    const nameIsLoggable = isCorporateEntity(record);
    // Each property is re-judged by its own key — the holding key's decision
    // does not carry into a nested object.
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      const lowerKey = key.toLowerCase();
      const keyIsLoggable = lowerKey === "name" ? nameIsLoggable : LOGGABLE_FIELDS.has(lowerKey);
      result[key] = redactNode(val, !keyIsLoggable);
    }
    return result;
  }
  return redactLeaf ? "[REDACTED]" : value;
}

/**
 * Whether a walked object asserts a corporate-entity identity in its own keys,
 * which gates whether a sibling `name` is loggable (#653). True iff this
 * object's own `kind` or `type` equals `"company"` (value compared
 * case-insensitively) — the discriminator the `Client` / `QuoteClient` /
 * `ClientInvoiceClient` / `CreditNoteClient` schemas carry. Read from the
 * object's own keys only; never inherited into nested objects.
 */
function isCorporateEntity(record: Record<string, unknown>): boolean {
  return isCompanyMarker(record["kind"]) || isCompanyMarker(record["type"]);
}

function isCompanyMarker(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "company";
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
