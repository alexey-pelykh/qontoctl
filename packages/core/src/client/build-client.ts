// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { buildApiKeyAuthorization } from "../auth/api-key.js";
import { createOAuthAuthorization } from "../auth/oauth-authorization-factory.js";
import { resolveAuthPreference, selectAuthChain, type ApiKeyInvalidReason, type AuthSlot } from "../auth/preference.js";
import { ConfigError, resolveScaMethod } from "../config/resolve.js";
import type { AuthPreference, ConfigResult, QontoctlConfig } from "../config/types.js";
import { OAUTH_TOKEN_SANDBOX_URL, OAUTH_TOKEN_URL } from "../constants.js";
import { HttpClient, type Authorization, type HttpClientLogger } from "../http-client.js";

/**
 * Optional behaviours layered onto the base fallback-chain assembly. Every
 * field is optional so the standalone MCP server passes (almost) nothing for
 * the lean path while the CLI passes the full superset (`--auth`, `--profile`,
 * `--sca-method`, debug/verbose logger). Read internally with `!== undefined`
 * guards; contribute each field at call sites via a conditional spread
 * (`...(x !== undefined ? { x } : {})`) to satisfy `exactOptionalPropertyTypes`.
 */
export interface BuildClientOptions {
  /** Explicit auth-preference override (CLI `--auth`). Falls back to config > built-in default. */
  readonly authPreference?: AuthPreference;
  /** Profile name threaded to OAuth so refreshed tokens persist to the right file (CLI `--profile`). */
  readonly profile?: string;
  /** SCA-method override (CLI `--sca-method`). */
  readonly scaMethodOverride?: string;
  /** Request/response logger (CLI `--debug` / `--verbose`). Omitted ⇒ no logging. */
  readonly logger?: HttpClientLogger;
  /**
   * Sink for non-fatal warnings emitted *during client construction* — the
   * auth-chain degrade notice and the primary→fallback notice. Omitted ⇒ those
   * warnings are dropped. Passing a sink (rather than hard-coding
   * `process.stderr`) keeps core free of process I/O and makes the warnings
   * assertable in tests. NOTE: file-level resolve warnings
   * ({@link ConfigResult.warnings}, e.g. insecure permissions) are NOT emitted
   * here — the caller owns those, since it holds the full result and decides
   * whether/how often to surface them.
   */
  readonly onWarning?: (message: string) => void;
}

/**
 * Detect an api-key block that is present-but-structurally-invalid (empty slug
 * or empty secret). {@link resolveConfig} already rejects these at config-load
 * time, so in practice this returns `undefined`; it is retained as
 * defense-in-depth so the #631 security-architect invariant — a user who
 * explicitly chose api-key must never silently degrade to OAuth fallback on an
 * api-key failure — is encoded structurally at the client-construction layer
 * too. Order (slug then secret) mirrors {@link buildApiKeyAuthorization}'s
 * throw order so the messaging is consistent.
 */
function detectApiKeyInvalidReason(apiKey: QontoctlConfig["apiKey"]): ApiKeyInvalidReason | undefined {
  if (apiKey === undefined) return undefined;
  if (apiKey.organizationSlug === "") return "empty-slug";
  if (apiKey.secretKey === "") return "empty-secret";
  return undefined;
}

/** Friendly label for an auth slot (used in primary→fallback stderr warnings). */
function describeSlot(slot: AuthSlot): string {
  if (slot === "oauth") return "OAuth";
  if (slot === "api-key") return "api-key";
  return "(none)";
}

/**
 * Assemble the fallback-chain {@link HttpClient} from an already-resolved
 * config. The shared auth-chain assembly extracted from the CLI's
 * `createClient` and the standalone MCP server's hand-rolled factory (#663):
 * both built this identical chain independently.
 *
 * This function deliberately does **two things it does not do**:
 * - It does NOT resolve config. The caller resolves (and owns re-resolution for
 *   per-call liveness — picking up mid-session OAuth-token refreshes); this
 *   takes the already-resolved {@link ConfigResult}.
 * - It does NOT build mode-pinned diagnose clients. Those stay in
 *   {@link buildDiagnoseClients} — ADR-DIAG keeps the fallback-chain client and
 *   the mode-pinned probe clients separate, by design.
 *
 * Synchronous by contract: config resolution is the only async step and the
 * caller owns it. The sync signature is also a structural guard behind #663 —
 * a sync builder cannot `await resolveConfig(...)`, so a caller physically
 * cannot smuggle a second, divergent config resolution into the client builder.
 *
 * @throws {ConfigError} (VALIDATION) when the resolved chain is fatal — e.g.
 *   `--auth api-key-first` with an empty `secret-key` — BEFORE constructing any
 *   client, so an api-key configuration error never silently degrades to the
 *   OAuth fallback (#631). In practice {@link resolveConfig} rejects empty
 *   credential fields first, so this branch is defense-in-depth.
 * @throws {Error} when no credentials are configured (no auth slot selectable).
 */
export function buildClientFromConfig(result: ConfigResult, options?: BuildClientOptions): HttpClient {
  const { config, endpoint, path, oauthAccessTokenFromEnv } = result;
  const emit = options?.onWarning;

  const preference = resolveAuthPreference(config, options?.authPreference);
  const apiKeyInvalidReason = detectApiKeyInvalidReason(config.apiKey);
  const selection = selectAuthChain(preference, {
    apiKey: config.apiKey !== undefined,
    oauth: config.oauth !== undefined,
    ...(apiKeyInvalidReason !== undefined ? { apiKeyInvalidReason } : {}),
  });

  if (selection.noCredentials) {
    throw new Error("No credentials found in configuration");
  }

  // Fatal-config guard (#631): explicit api-key primary with present-but-invalid
  // api-key creds → refuse to build a client at all, rather than silently
  // degrading to OAuth fallback on an api-key configuration problem.
  if (selection.fatal !== undefined) {
    throw new ConfigError(selection.fatal.reason, "VALIDATION");
  }

  if (selection.warning !== undefined) {
    emit?.(`Warning: ${selection.warning}\n`);
  }

  const oauthFactory = (): Authorization => {
    if (config.oauth === undefined) {
      // selectAuthChain only emits the "oauth" slot when oauth creds are
      // present, so this is unreachable. Kept as a defensive check rather than
      // a non-null assertion to preserve auditability.
      throw new Error("Internal error: OAuth slot selected but no OAuth credentials available");
    }
    return createOAuthAuthorization({
      oauth: config.oauth,
      tokenUrl: config.oauth.stagingToken !== undefined ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL,
      ...(path !== undefined ? { path } : {}),
      ...(options?.profile !== undefined ? { profile: options.profile } : {}),
      readOnly: oauthAccessTokenFromEnv,
    });
  };

  const apiKeyFactory = (): Authorization => {
    if (config.apiKey === undefined) {
      throw new Error("Internal error: api-key slot selected but no api-key credentials available");
    }
    return buildApiKeyAuthorization(config.apiKey);
  };

  const buildSlot = (slot: AuthSlot): Authorization | undefined => {
    if (slot === "oauth") return oauthFactory();
    if (slot === "api-key") return apiKeyFactory();
    return undefined;
  };

  const authorization = buildSlot(selection.primary);
  if (authorization === undefined) {
    // selectAuthChain guarantees primary !== null when noCredentials === false.
    throw new Error("Internal error: auth chain has no primary credential");
  }
  const fallbackAuthorization = buildSlot(selection.fallback);

  const scaMethod = resolveScaMethod(config, options?.scaMethodOverride);

  return new HttpClient({
    baseUrl: endpoint,
    authorization,
    fallbackAuthorization,
    onFallback: (method, p) => {
      emit?.(
        `Warning: primary authentication failed, falling back to ${describeSlot(selection.fallback)} for ${method} ${p}\n`,
      );
    },
    ...(options?.logger !== undefined ? { logger: options.logger } : {}),
    stagingToken: config.oauth?.stagingToken,
    ...(scaMethod !== undefined ? { scaMethod } : {}),
  });
}
