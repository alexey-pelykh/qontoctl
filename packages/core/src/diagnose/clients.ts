// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { buildApiKeyAuthorization } from "../auth/api-key.js";
import { createOAuthAuthorization } from "../auth/oauth-authorization-factory.js";
import type { QontoctlConfig } from "../config/types.js";
import { OAUTH_TOKEN_SANDBOX_URL, OAUTH_TOKEN_URL } from "../constants.js";
import { HttpClient } from "../http-client.js";

/**
 * Build a single-mode HTTP client for diagnose.
 *
 * Diagnose deliberately needs **mode-pinned** clients — the api-key-health
 * check must call with api-key only (no OAuth fallback), and oauth-health
 * must call with OAuth only (no api-key fallback). Otherwise a chain that
 * silently falls back masks the very condition the check is trying to
 * diagnose.
 *
 * Returns `undefined` when the requested credentials are not configured
 * (the caller — {@link buildDiagnoseClients} — leaves the slot empty in
 * the context, and the runner skips checks that depend on it).
 */
export function buildApiKeyClient(config: QontoctlConfig, endpoint: string): HttpClient | undefined {
  if (config.apiKey === undefined) return undefined;
  let authorization: string;
  try {
    authorization = buildApiKeyAuthorization(config.apiKey);
  } catch {
    // Empty slug or empty key — diagnose surfaces this via auth-credentials.
    return undefined;
  }
  return new HttpClient({
    baseUrl: endpoint,
    authorization,
    ...(config.oauth?.stagingToken !== undefined ? { stagingToken: config.oauth.stagingToken } : {}),
  });
}

/**
 * Build a single-mode OAuth HTTP client for diagnose. The token-refresh
 * factory is wired in `readOnly: false` mode so refresh-on-expiry happens
 * naturally — this is what `oauth-health` needs to exercise.
 *
 * The factory persists refreshed tokens to the loaded config file via
 * the writer's standard resolution chain.
 */
export function buildOAuthClient(config: QontoctlConfig, endpoint: string): HttpClient | undefined {
  if (config.oauth === undefined) return undefined;
  const tokenUrl = config.oauth.stagingToken !== undefined ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL;
  const authorization = createOAuthAuthorization({
    oauth: config.oauth,
    tokenUrl,
    readOnly: false,
  });
  return new HttpClient({
    baseUrl: endpoint,
    authorization,
    ...(config.oauth.stagingToken !== undefined ? { stagingToken: config.oauth.stagingToken } : {}),
  });
}

/**
 * Slot pair returned by {@link buildDiagnoseClients}. Either slot may be
 * `undefined` when the corresponding credentials are absent — the diagnose
 * runner uses presence to decide which checks to skip.
 */
export interface DiagnoseClients {
  readonly apiKey: HttpClient | undefined;
  readonly oauth: HttpClient | undefined;
}

/**
 * Build both mode-pinned clients in one call. Convenience over calling
 * {@link buildApiKeyClient} and {@link buildOAuthClient} separately.
 */
export function buildDiagnoseClients(config: QontoctlConfig, endpoint: string): DiagnoseClients {
  return {
    apiKey: buildApiKeyClient(config, endpoint),
    oauth: buildOAuthClient(config, endpoint),
  };
}
