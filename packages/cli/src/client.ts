// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  type ApiKeyInvalidReason,
  type Authorization,
  type AuthSlot,
  type HttpClientLogger,
  type QontoctlConfig,
  ConfigError,
  HttpClient,
  resolveConfig,
  resolveScaMethod,
  resolveAuthPreference,
  selectAuthChain,
  buildApiKeyAuthorization,
  createOAuthAuthorization,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
} from "@qontoctl/core";
import { buildResolveOptions } from "./inherited-options.js";
import type { GlobalOptions } from "./options.js";

/**
 * Inspect an api-key credentials block for structural invalidity that
 * `resolveConfig` would normally reject at config-load time, but which we
 * also check here as defense-in-depth so the security-architect invariant
 * from #631 (a user who explicitly chose api-key must never silently
 * degrade to OAuth fallback on api-key failure) is encoded structurally
 * at the client-construction layer too.
 *
 * Returns `undefined` when the api-key block is structurally valid or
 * absent; returns a typed {@link ApiKeyInvalidReason} when present-but-
 * invalid. The order (slug first, then secret) mirrors
 * `buildApiKeyAuthorization`'s throw order so the messaging is consistent.
 */
function detectApiKeyInvalidReason(apiKey: QontoctlConfig["apiKey"]): ApiKeyInvalidReason | undefined {
  if (apiKey === undefined) return undefined;
  if (apiKey.organizationSlug === "") return "empty-slug";
  if (apiKey.secretKey === "") return "empty-secret";
  return undefined;
}

/**
 * Create an authenticated HttpClient from global CLI options.
 *
 * Resolves configuration (`--config` > `QONTOCTL_CONFIG_FILE` env >
 * `--profile` derived path > home default), resolves the auth precedence
 * preference (`--auth` flag > `QONTOCTL_AUTH` env > config > built-in default
 * `oauth-first`), builds the authorization chain accordingly, and uses the
 * resolved endpoint.
 *
 * Auth precedence is governed by the resolved {@link import("@qontoctl/core").AuthPreference}:
 * - `api-key` — api-key only, no fallback
 * - `api-key-first` — api-key primary, OAuth fallback when api-key fails
 * - `oauth` — OAuth only, no fallback
 * - `oauth-first` (default) — OAuth primary, api-key fallback when OAuth fails
 *
 * Both fallback paths trigger on HTTP 401/403 (when the auth header was built
 * successfully but the API rejected it) AND on auth-flow failures: OAuth
 * refresh-token expiry (see {@link import("@qontoctl/core").OAuthRefreshError})
 * AND missing OAuth access token at request time (see
 * {@link import("@qontoctl/core").OAuthNoTokenError}, added in #631 PR2 so
 * `oauth-first` falls back to api-key when the user has not yet run
 * `qontoctl auth login`).
 *
 * **Fatal-config guard** (#631 PR2): when the resolved chain has
 * {@link import("@qontoctl/core").AuthChainSelection.fatal} set — for example,
 * `--auth api-key-first` with empty `secret-key` — this function throws a
 * {@link ConfigError} BEFORE building any HTTP client, so the user sees a
 * clear configuration error rather than a confusing late-stage auth failure
 * (and there is no risk of the OAuth fallback engaging on an api-key
 * configuration problem). In practice `resolveConfig` rejects empty credential
 * fields at config-load time, so this branch is defense-in-depth.
 */
export async function createClient(options: GlobalOptions): Promise<HttpClient> {
  const { config, endpoint, warnings, path, oauthAccessTokenFromEnv } = await resolveConfig(
    buildResolveOptions(options),
  );

  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }

  const preference = resolveAuthPreference(config, options.auth);
  const apiKeyInvalidReason = detectApiKeyInvalidReason(config.apiKey);
  const selection = selectAuthChain(preference, {
    apiKey: config.apiKey !== undefined,
    oauth: config.oauth !== undefined,
    ...(apiKeyInvalidReason !== undefined ? { apiKeyInvalidReason } : {}),
  });

  if (selection.noCredentials) {
    throw new Error("No credentials found in configuration");
  }

  // Fatal-config guard: when the user's explicit primary is api-key and the
  // api-key credentials are present-but-invalid, refuse to construct an HTTP
  // client at all. selectAuthChain.fatal encodes the security-architect
  // invariant (#631 /council deliberation) that the user must see api-key
  // configuration errors rather than silent degradation to OAuth fallback.
  if (selection.fatal !== undefined) {
    throw new ConfigError(selection.fatal.reason, "VALIDATION");
  }

  if (selection.warning !== undefined) {
    process.stderr.write(`Warning: ${selection.warning}\n`);
  }

  const oauthFactory = (): Authorization => {
    if (config.oauth === undefined) {
      // selectAuthChain only emits the "oauth" slot when oauth creds are
      // present, so this is unreachable. Kept as a defensive check rather
      // than a non-null assertion to preserve auditability.
      throw new Error("Internal error: OAuth slot selected but no OAuth credentials available");
    }
    return createOAuthAuthorization({
      oauth: config.oauth,
      tokenUrl: config.oauth.stagingToken !== undefined ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL,
      ...(path !== undefined ? { path } : {}),
      ...(options.profile !== undefined ? { profile: options.profile } : {}),
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

  let logger: HttpClientLogger | undefined;
  if (options.debug === true) {
    process.stderr.write(
      "Warning: Debug mode logs full API responses which may include financial data (IBANs, balances). " +
        "Do not use in shared environments.\n",
    );
    logger = {
      verbose: (msg) => process.stderr.write(`${msg}\n`),
      debug: (msg) => process.stderr.write(`${msg}\n`),
    };
  } else if (options.verbose === true) {
    logger = {
      verbose: (msg) => process.stderr.write(`${msg}\n`),
      debug: () => {},
    };
  }

  const scaMethod = resolveScaMethod(config, options.scaMethod);

  return new HttpClient({
    baseUrl: endpoint,
    authorization,
    fallbackAuthorization,
    onFallback: (method, p) => {
      process.stderr.write(
        `Warning: primary authentication failed, falling back to ${describeSlot(selection.fallback)} for ${method} ${p}\n`,
      );
    },
    logger,
    stagingToken: getStagingToken(config),
    ...(scaMethod !== undefined ? { scaMethod } : {}),
  });
}

/**
 * Read the staging token off the resolved config when present. Extracted so
 * the call site stays free of `?.` chains (the token may live under `oauth`
 * but is logically a transport-layer setting and must be applied to whatever
 * authorization mode is in effect).
 */
function getStagingToken(config: QontoctlConfig): string | undefined {
  return config.oauth?.stagingToken;
}

/**
 * Friendly label for a slot value (used in stderr warnings).
 */
function describeSlot(slot: AuthSlot): string {
  if (slot === "oauth") return "OAuth";
  if (slot === "api-key") return "api-key";
  return "(none)";
}
