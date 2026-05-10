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
 */
export interface AuthChainSelection {
  primary: AuthSlot;
  fallback: AuthSlot;
  warning?: string;
  noCredentials: boolean;
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
 */
export function selectAuthChain(
  preference: AuthPreference,
  available: { apiKey: boolean; oauth: boolean },
): AuthChainSelection {
  const { apiKey, oauth } = available;

  if (!apiKey && !oauth) {
    return { primary: null, fallback: null, noCredentials: true };
  }

  switch (preference) {
    case "api-key": {
      if (apiKey) {
        return { primary: "api-key", fallback: null, noCredentials: false };
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
        return { primary: "api-key", fallback: "oauth", noCredentials: false };
      }
      if (apiKey) {
        return { primary: "api-key", fallback: null, noCredentials: false };
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
