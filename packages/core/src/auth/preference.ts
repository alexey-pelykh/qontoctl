// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { AuthPreference, QontoctlConfig } from "../config/types.js";
import { AUTH_PREFERENCES, DEFAULT_AUTH_PREFERENCE } from "../config/types.js";

/**
 * Type guard: `true` when `value` is a valid {@link AuthPreference} string.
 *
 * Used by the CLI flag's Commander `.choices()` validation, the env-overlay
 * filter, and any other input-boundary check. Centralizing the test means a
 * future addition to {@link AUTH_PREFERENCES} (e.g., a fifth mode) lights up
 * every input path uniformly.
 */
export function isAuthPreference(value: unknown): value is AuthPreference {
  return typeof value === "string" && (AUTH_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Resolve the effective {@link AuthPreference} for a CLI/MCP invocation.
 *
 * Precedence (highest first), per #523:
 *
 * 1. `override` — caller-supplied value (typically the CLI's `--auth` flag).
 *    The Commander layer validates this against {@link AUTH_PREFERENCES}, so
 *    by the time it reaches here it is already a valid mode (or `undefined`).
 * 2. `config.auth.preference` — already-resolved value carrying the file-or-env
 *    tier. The `applyEnvOverlay` step writes the env value (`QONTOCTL_AUTH`)
 *    onto this field, which means env > file (per the standard env-overlay
 *    rule). When neither env nor file supplies a value, this field is `undefined`
 *    and the default takes over.
 * 3. {@link DEFAULT_AUTH_PREFERENCE} — `oauth-first`, preserving pre-#523
 *    behavior when both credentials are present.
 *
 * The CLI passes its `--auth` flag verbatim; the MCP server has no flag and
 * always passes `undefined`, so MCP effectively resolves to env > file > default.
 *
 * @param config Resolved config (env-overlaid).
 * @param override Optional explicit preference (CLI flag value).
 */
export function resolveAuthPreference(config: QontoctlConfig, override?: AuthPreference): AuthPreference {
  if (override !== undefined) {
    return override;
  }
  if (config.auth?.preference !== undefined) {
    return config.auth.preference;
  }
  return DEFAULT_AUTH_PREFERENCE;
}

/**
 * Authorization slot in the resolved chain — names the credential that should
 * fill the `authorization` (primary) or `fallbackAuthorization` (secondary)
 * position of the {@link import("../http-client.js").HttpClient}.
 *
 * `null` represents an empty slot (no credential bound here).
 */
export type AuthSlot = "api-key" | "oauth" | null;

/**
 * Reasons the api-key credential block can be structurally invalid despite
 * being structurally present (i.e., the `api-key:` block exists in config
 * but one of its required fields is empty).
 *
 * In practice, `resolveConfig` rejects empty `organization-slug` /
 * `secret-key` at config-load time before {@link selectAuthChain} runs, so
 * this signal is rarely set in production. It is plumbed through anyway as
 * defense-in-depth so the security-architect invariant from #631's
 * `/council` deliberation — "a user who explicitly asked for api-key as
 * primary must NEVER silently fall back to OAuth on api-key failure" — is
 * encoded structurally at the matrix layer too, not only at the validation
 * layer. A future refactor that defers or relaxes config-load validation
 * would still trip the matrix-level guard.
 */
export type ApiKeyInvalidReason = "empty-slug" | "empty-secret";

/**
 * Inputs to {@link selectAuthChain} — describes which credential types are
 * structurally present in the resolved config (and optionally signals that
 * api-key credentials are present-but-structurally-invalid).
 *
 * The `apiKey` / `oauth` boolean fields preserve the original 16-case matrix
 * shape (4 modes × 4 credential-presence states). The optional
 * {@link apiKeyInvalidReason} signal, when set alongside `apiKey: true`,
 * triggers {@link AuthChainSelection.fatal} population under preferences
 * where api-key is the user's explicit primary (`api-key`, `api-key-first`).
 *
 * Callers in production code (CLI/MCP `createClient`) compute
 * `apiKeyInvalidReason` by inspecting `config.apiKey.organizationSlug` /
 * `secretKey` for empty strings; tests construct it directly to exercise
 * the matrix.
 */
export interface AvailableCredentials {
  /** Whether the `api-key:` block is structurally present in config. */
  readonly apiKey: boolean;
  /** Whether the `oauth:` block is structurally present in config. */
  readonly oauth: boolean;
  /**
   * When set alongside `apiKey: true`, signals the api-key credentials are
   * present-but-invalid. Triggers {@link AuthChainSelection.fatal} under
   * `api-key` / `api-key-first` preferences (the modes where the user
   * explicitly chose api-key as primary). Has NO effect under `oauth` /
   * `oauth-first` — even if api-key would serve as the (un-asked-for)
   * fallback, the user's explicit primary was OAuth, so an api-key
   * configuration issue is not fatal to the request flow.
   */
  readonly apiKeyInvalidReason?: ApiKeyInvalidReason;
}

/**
 * Result of {@link selectAuthChain}: which credentials fill the primary and
 * fallback slots, plus a non-fatal warning describing any degrade.
 *
 * Shape decisions:
 *
 * - Returns NAMES of credentials, not built `Authorization` objects, so this
 *   helper can stay package-agnostic. The callers (CLI / MCP) build the actual
 *   {@link import("../http-client.js").Authorization} objects from the slot
 *   names — only they have the per-package context (`path`, `profile`,
 *   `readOnly`, `tokenUrl`) needed for {@link import("./oauth-authorization-factory.js").createOAuthAuthorization}.
 * - `warning` is informational, not a hard error: when a `*-first` preference
 *   has only one credential available, the chain degrades to that single
 *   credential and `warning` describes what happened. Callers print to stderr.
 * - `noCredentials` is `true` when neither api-key nor OAuth is configured —
 *   the caller MUST surface this as a fatal error (no chain can be built).
 * - `fatal` is set when the auth chain is structurally unsafe and the caller
 *   MUST throw a configuration error before constructing any HTTP client.
 *   Currently populated under `api-key` / `api-key-first` when api-key
 *   credentials are present-but-invalid (encoding the security-architect
 *   invariant from #631 — see {@link ApiKeyInvalidReason}).
 */
export interface AuthChainSelection {
  primary: AuthSlot;
  fallback: AuthSlot;
  warning?: string;
  noCredentials: boolean;
  /**
   * When set, the caller MUST throw a configuration error before building
   * any HTTP client. Encodes the security-architect invariant from #631's
   * `/council` deliberation: a user who explicitly asked for api-key as
   * primary (`api-key` or `api-key-first`) must see api-key configuration
   * errors, not silent degradation to OAuth fallback.
   *
   * `mode` is the {@link AuthPreference} the user requested (for error
   * messaging); `reason` is a human-readable description of the structural
   * problem (typically embedding the {@link ApiKeyInvalidReason}).
   *
   * `primary` / `fallback` are still populated normally so the matrix's
   * shape stays observable to debugging tools — callers that ignore `fatal`
   * see the same chain that would have been built without the guard. It is
   * the explicit `fatal` check at construction time that gives the typed
   * "do not proceed" signal.
   */
  fatal?: {
    mode: AuthPreference;
    reason: string;
  };
}

/**
 * Select which credentials fill the auth chain given a resolved preference and
 * the credentials actually available in config.
 *
 * Decision matrix (16 cases — 4 modes × 4 credential states):
 *
 * | Mode             | both       | api-key only | oauth only      | none |
 * |------------------|------------|--------------|-----------------|------|
 * | `api-key`        | api-key    | api-key      | degrade→oauth*  | NONE |
 * | `api-key-first`  | api-key→oa | api-key      | degrade→oauth*  | NONE |
 * | `oauth`          | oauth      | degrade→ak*  | oauth           | NONE |
 * | `oauth-first`    | oauth→ak   | degrade→ak*  | oauth           | NONE |
 *
 * `*` = warning emitted because the requested mode lacks the matching credential.
 *
 * The "degrade" rule (rather than "fail loud") reflects the AC's pragmatic stance:
 * a workflow that has only api-key creds shouldn't break just because the user
 * pinned `oauth` in a profile shared with another machine. The warning surfaces
 * the divergence so the operator can fix the config when convenient.
 *
 * **Fatal-config overlay** (security-architect invariant, #631 PR2): when the
 * user's explicit primary is api-key (`api-key` or `api-key-first`) AND the
 * api-key credentials are present-but-invalid
 * ({@link AvailableCredentials.apiKeyInvalidReason} set), the returned
 * {@link AuthChainSelection.fatal} field signals that the caller MUST throw
 * a configuration error rather than proceeding. The primary/fallback slots
 * remain populated for observability; the explicit `fatal` check is the gate.
 * This does NOT trigger under `oauth` / `oauth-first` because the user's
 * explicit primary was OAuth — an api-key configuration issue is not fatal
 * to a request flow whose primary credential is OAuth.
 */
export function selectAuthChain(preference: AuthPreference, available: AvailableCredentials): AuthChainSelection {
  const { apiKey, oauth, apiKeyInvalidReason } = available;

  if (!apiKey && !oauth) {
    return { primary: null, fallback: null, noCredentials: true };
  }

  switch (preference) {
    case "api-key": {
      if (apiKey) {
        const base: AuthChainSelection = { primary: "api-key", fallback: null, noCredentials: false };
        if (apiKeyInvalidReason !== undefined) {
          return {
            ...base,
            fatal: {
              mode: "api-key",
              reason: `auth preference "api-key" selected but api-key credentials are invalid (${apiKeyInvalidReason})`,
            },
          };
        }
        return base;
      }
      // Requested api-key only, but only OAuth available — degrade with warning.
      return {
        primary: "oauth",
        fallback: null,
        warning: 'auth preference "api-key" set but no api-key credentials configured; using OAuth instead',
        noCredentials: false,
      };
    }
    case "api-key-first": {
      if (apiKey && oauth) {
        const base: AuthChainSelection = { primary: "api-key", fallback: "oauth", noCredentials: false };
        if (apiKeyInvalidReason !== undefined) {
          return {
            ...base,
            fatal: {
              mode: "api-key-first",
              reason: `auth preference "api-key-first" selected but api-key credentials are invalid (${apiKeyInvalidReason}); refusing to silently fall back to OAuth`,
            },
          };
        }
        return base;
      }
      if (apiKey) {
        const base: AuthChainSelection = { primary: "api-key", fallback: null, noCredentials: false };
        if (apiKeyInvalidReason !== undefined) {
          return {
            ...base,
            fatal: {
              mode: "api-key-first",
              reason: `auth preference "api-key-first" selected but api-key credentials are invalid (${apiKeyInvalidReason})`,
            },
          };
        }
        return base;
      }
      // Only OAuth available, but api-key was requested as primary — degrade.
      return {
        primary: "oauth",
        fallback: null,
        warning: 'auth preference "api-key-first" set but no api-key credentials configured; using OAuth instead',
        noCredentials: false,
      };
    }
    case "oauth": {
      if (oauth) {
        return { primary: "oauth", fallback: null, noCredentials: false };
      }
      // Requested oauth only, but only api-key available — degrade with warning.
      return {
        primary: "api-key",
        fallback: null,
        warning: 'auth preference "oauth" set but no OAuth credentials configured; using api-key instead',
        noCredentials: false,
      };
    }
    case "oauth-first": {
      if (oauth && apiKey) {
        return { primary: "oauth", fallback: "api-key", noCredentials: false };
      }
      if (oauth) {
        return { primary: "oauth", fallback: null, noCredentials: false };
      }
      // Only api-key available, but OAuth was requested as primary — degrade.
      return {
        primary: "api-key",
        fallback: null,
        warning: 'auth preference "oauth-first" set but no OAuth credentials configured; using api-key instead',
        noCredentials: false,
      };
    }
  }
}
