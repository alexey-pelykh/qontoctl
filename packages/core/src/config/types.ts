// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * API key credentials for authenticating with the Qonto API.
 */
export interface ApiKeyCredentials {
  organizationSlug: string;
  secretKey: string;
}

/**
 * OAuth 2.0 credentials for authenticating with the Qonto API.
 */
export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  /** ISO 8601 timestamp of when the access token expires. */
  accessTokenExpiresAt?: string;
  /** OAuth scopes granted to the access token. */
  scopes?: string[];
  /** Staging token for sandbox environment (OAuth-only). */
  stagingToken?: string;
}

/**
 * SCA-related configuration.
 */
export interface ScaConfig {
  /**
   * SCA method preference, sent as the `X-Qonto-2fa-Preference` header on
   * write requests. Production allows `paired-device`, `passkey`, `sms-otp`;
   * sandbox additionally allows `mock`. Free-form `string` to accommodate
   * future Qonto values without a core release.
   */
  method?: string;
}

/**
 * Explicit authentication preference modes for {@link AuthConfig.preference}.
 *
 * Replaces the legacy presence-based selection (`oauth.accessToken
 * !== undefined ⇒ OAuth primary, api-key fallback`) with explicit user control
 * over which credential is primary AND whether the other is a fallback.
 *
 * - `api-key` — api-key only, **no fallback**. Use when api-key auth must be
 *   forced and OAuth must NEVER be attempted (e.g., CI where OAuth is
 *   undesirable, or pinned-credential workflows).
 * - `api-key-first` — api-key primary, OAuth fallback when api-key fails.
 * - `oauth` — OAuth only, **no fallback**. Use to force-pin OAuth and surface
 *   refresh failures loudly (vs silently degrading to api-key).
 * - `oauth-first` — OAuth primary, api-key fallback when OAuth fails. **Default**
 *   when both credentials are present and no preference is set; preserves
 *   the pre-#523 behavior.
 *
 * The `*-first` modes wire fallback when the secondary credential is available;
 * non-`-first` modes never wire fallback.
 *
 * Industry precedent: AWS SDK credential provider chain, gcloud Application
 * Default Credentials, kubectl context picker (no-fallback model).
 */
export type AuthPreference = "api-key" | "api-key-first" | "oauth" | "oauth-first";

/**
 * All valid {@link AuthPreference} values, used for runtime validation
 * (env-var parsing, Commander `.choices()`, schema validation).
 */
export const AUTH_PREFERENCES: readonly AuthPreference[] = [
  "api-key",
  "api-key-first",
  "oauth",
  "oauth-first",
] as const;

/**
 * Default preference applied when neither flag, env var, nor config sets one.
 *
 * Chosen to preserve pre-#523 behavior: OAuth primary (when both creds
 * present), api-key as silent fallback. Flipping the default direction is a
 * separate major-release decision gated on telemetry.
 */
export const DEFAULT_AUTH_PREFERENCE: AuthPreference = "oauth-first";

/**
 * Authentication-related configuration.
 *
 * Currently exposes the {@link preference} field. Lives at top-level (not
 * under `oauth` or `api-key`) because the preference governs the chain
 * across both credential types — placing it under either would imply
 * subordination that the field does not have.
 */
export interface AuthConfig {
  /**
   * Explicit auth preference mode. See {@link AuthPreference}.
   *
   * Precedence (highest first): `--auth` CLI flag > `QONTOCTL_AUTH` env var
   * > `auth.preference` config field > {@link DEFAULT_AUTH_PREFERENCE}.
   */
  preference?: AuthPreference;
}

/**
 * Parsed configuration from a `.qontoctl.yaml` file.
 */
export interface QontoctlConfig {
  apiKey?: ApiKeyCredentials;
  oauth?: OAuthCredentials;
  endpoint?: string;
  sca?: ScaConfig;
  auth?: AuthConfig;
}

/**
 * Result of resolving configuration, including any warnings encountered.
 */
export interface ConfigResult {
  config: QontoctlConfig;
  /** Resolved API endpoint URL. */
  endpoint: string;
  warnings: string[];
  /**
   * Absolute path of the config file that was loaded, or `undefined` when no
   * file was found (env-only or no-config invocations).
   *
   * Callers performing follow-on writes (`saveOAuthTokens`, etc.) MUST round-
   * trip this value via the writer's `path` option to guarantee load/write
   * consistency — i.e. the writer cannot silently land on a different file
   * than the loader read from. See #479 for the load/write divergence class
   * this field eliminates.
   */
  path: string | undefined;
  /**
   * `true` when `config.oauth.accessToken` came from `QONTOCTL_ACCESS_TOKEN`
   * (or its profile-scoped variant) — i.e. the env-supplied bearer overrode
   * any file value.
   *
   * When `true`, the OAuth authorization factory must treat the token as
   * **read-only / discard-after-use**: the token is used as a bearer for
   * the current invocation only; no proactive refresh is attempted, and no
   * refreshed tokens are persisted to disk. Mirrors `AWS_SESSION_TOKEN`
   * semantics. See issue #495 for design rationale and industry precedent.
   */
  oauthAccessTokenFromEnv: boolean;
}

/**
 * Options for resolving configuration.
 *
 * Path resolution precedence (highest first):
 *   1. `path` — explicit absolute or relative path
 *   2. `QONTOCTL_CONFIG_FILE` env var
 *   3. `profile` — derives `~/.qontoctl/{profile}.yaml`
 *   4. `~/.qontoctl.yaml` (home default)
 *
 * No CWD inspection is performed at any stage. Local-config workflows must
 * use `path`, the env var, or a direnv shim that exports the env var.
 */
export interface ResolveOptions {
  /**
   * Explicit path to a config file. Highest-priority resolution input;
   * overrides {@link profile} and the `QONTOCTL_CONFIG_FILE` env var.
   *
   * Mutually exclusive in spirit with {@link profile}: when both are passed
   * and disagree, `path` wins (callers that want profile-derived paths
   * should pass `profile` only).
   */
  path?: string | undefined;
  /** Named profile to load from `~/.qontoctl/{profile}.yaml`. */
  profile?: string | undefined;
  /** Override home directory for file resolution (useful for testing). */
  home?: string | undefined;
  /** Override environment variables (useful for testing). */
  env?: Record<string, string | undefined> | undefined;
}
