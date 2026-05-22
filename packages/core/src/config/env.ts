// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { ApiKeyCredentials, AuthConfig, AuthPreference, OAuthCredentials, ScaConfig } from "./types.js";
import { AUTH_PREFERENCES } from "./types.js";

const ENV_PREFIX = "QONTOCTL";
const ORG_SLUG_SUFFIX = "ORGANIZATION_SLUG";
const SECRET_KEY_SUFFIX = "SECRET_KEY";
const ENDPOINT_SUFFIX = "ENDPOINT";
const CLIENT_ID_SUFFIX = "CLIENT_ID";
const CLIENT_SECRET_SUFFIX = "CLIENT_SECRET";
const ACCESS_TOKEN_SUFFIX = "ACCESS_TOKEN";
const STAGING_TOKEN_SUFFIX = "STAGING_TOKEN";
const SCA_METHOD_SUFFIX = "SCA_METHOD";
// `QONTOCTL_AUTH` (no `_PREFERENCE` suffix) mirrors the user-facing `--auth`
// CLI flag — the dominant interaction surface — rather than the YAML structure
// `auth.preference`. Trade-off accepted: the YAML/file path is more verbose,
// the env var is leaner. If the `auth` section grows additional fields they
// will use `QONTOCTL_AUTH_<FIELD>` (e.g. `QONTOCTL_AUTH_TIMEOUT`); preference
// keeps the canonical short form because it is the section's primary control.
const AUTH_SUFFIX = "AUTH";

/**
 * Subset of {@link OAuthCredentials} that env vars are permitted to set.
 *
 * **Runtime-mutable fields are deliberately EXCLUDED**:
 *
 * - `refreshToken` — rotated on every refresh; env-overlay would shadow rotation
 *   results on subsequent reads, defeating persistence. No major CLI accepts a
 *   refresh-token via env (`gh`, `aws`, `gcloud`, `kubectl`, `op`, `npm`,
 *   `docker`, `heroku`, `vercel` — zero precedent).
 * - `accessTokenExpiresAt` — derived from the token-endpoint response; not
 *   user-controlled.
 * - `scopes` — derived from the server response; not user-controlled.
 *
 * `accessToken` IS included with **read-only / discard-after-use** semantics:
 * the token is used as a bearer for the current invocation, never refreshed
 * and never written back to disk. Mirrors `AWS_SESSION_TOKEN` and
 * `OP_SESSION_*` precedent for time-bounded env tokens.
 */
export type StaticOAuthFields = Pick<OAuthCredentials, "clientId" | "clientSecret" | "accessToken" | "stagingToken">;

/**
 * Static-fields-only view of a config — the shape that {@link applyEnvOverlay}
 * operates on.
 *
 * **Type contract**: re-introducing a runtime-mutable field via env requires
 * widening {@link StaticOAuthFields} (or this type), which is a deliberate
 * change reviewed at compile time — not a drive-by additive runtime regression.
 */
export interface EnvOverlayConfig {
  apiKey?: ApiKeyCredentials;
  oauth?: StaticOAuthFields;
  endpoint?: string;
  sca?: ScaConfig;
  auth?: AuthConfig;
}

/**
 * Result of {@link applyEnvOverlay}.
 *
 * The `accessTokenFromEnv` flag carries the read-only / discard-after-use
 * signal downstream: when `true`, the OAuth authorization factory must skip
 * proactive refresh and must not persist refreshed tokens to disk, so the
 * env-supplied token is honored as a single-invocation bearer.
 */
export interface EnvOverlayResult {
  config: EnvOverlayConfig;
  /**
   * `true` when `QONTOCTL_ACCESS_TOKEN` (or its profile-scoped variant) was
   * present in the env passed to {@link applyEnvOverlay}.
   */
  accessTokenFromEnv: boolean;
}

/**
 * Overlays environment variables onto a static-only view of the config.
 *
 * Reads STATIC fields only — fields that are configuration inputs the tool
 * reads but never writes back during normal operation:
 *
 * - `QONTOCTL_ORGANIZATION_SLUG`, `QONTOCTL_SECRET_KEY` (api-key)
 * - `QONTOCTL_CLIENT_ID`, `QONTOCTL_CLIENT_SECRET` (oauth identity)
 * - `QONTOCTL_ACCESS_TOKEN` (oauth bearer; **read-only / discard-after-use**)
 * - `QONTOCTL_STAGING_TOKEN` (sandbox routing)
 * - `QONTOCTL_ENDPOINT` (override)
 * - `QONTOCTL_SCA_METHOD` (preference)
 * - `QONTOCTL_AUTH` (auth precedence — `api-key` / `api-key-first` / `oauth`
 *   / `oauth-first`; invalid values are silently dropped here, the `--auth`
 *   flag's `choices()` validation catches misspellings at parse time)
 *
 * Runtime-mutable fields (`refreshToken`, `accessTokenExpiresAt`, `scopes`)
 * are **never** read from env. They belong to file state the tool both reads
 * and writes; env vars carry inputs, not state. See council Verdict #2 in
 * issue #495 for the design rationale and industry precedent.
 *
 * - Without profile: reads `QONTOCTL_<SUFFIX>`
 * - With profile: reads `QONTOCTL_<PROFILE>_<SUFFIX>` (profile uppercased,
 *   hyphens→underscores)
 *
 * Env vars take precedence over file values.
 */
export function applyEnvOverlay(
  config: EnvOverlayConfig,
  options?: {
    profile?: string | undefined;
    env?: Record<string, string | undefined> | undefined;
  },
): EnvOverlayResult {
  const env = options?.env ?? process.env;
  const prefix = buildPrefix(options?.profile);

  const orgSlug = env[`${prefix}_${ORG_SLUG_SUFFIX}`];
  const secretKey = env[`${prefix}_${SECRET_KEY_SUFFIX}`];
  const endpoint = env[`${prefix}_${ENDPOINT_SUFFIX}`];
  const clientId = env[`${prefix}_${CLIENT_ID_SUFFIX}`];
  const clientSecret = env[`${prefix}_${CLIENT_SECRET_SUFFIX}`];
  const accessToken = env[`${prefix}_${ACCESS_TOKEN_SUFFIX}`];
  const stagingToken = env[`${prefix}_${STAGING_TOKEN_SUFFIX}`];
  const scaMethod = env[`${prefix}_${SCA_METHOD_SUFFIX}`];
  const authPreference = env[`${prefix}_${AUTH_SUFFIX}`];

  let result: EnvOverlayConfig = config;

  if (orgSlug !== undefined || secretKey !== undefined) {
    const existing = result.apiKey;
    result = {
      ...result,
      apiKey: {
        organizationSlug: orgSlug ?? existing?.organizationSlug ?? "",
        secretKey: secretKey ?? existing?.secretKey ?? "",
      },
    };
  }

  if (clientId !== undefined || clientSecret !== undefined || accessToken !== undefined) {
    const existing = result.oauth;
    const mergedClientId = clientId ?? existing?.clientId;
    const mergedClientSecret = clientSecret ?? existing?.clientSecret;
    const mergedAccessToken = accessToken ?? existing?.accessToken;

    // Only synthesize/merge an oauth block when client credentials can be
    // fully resolved from some combination of env + file. Without
    // client-id + client-secret, an oauth block is unusable: the bearer
    // cannot be refreshed, and downstream resolution would throw a
    // misleading "missing client-id" error pointing at credentials the
    // user never asked to set. The pre-#479 behavior synthesized an oauth
    // object with empty-string client-id when env supplied only an
    // access-token override — surfacing the wrong error class to the user
    // who simply wanted to override the bearer for one invocation.
    //
    // When client credentials cannot be resolved (e.g., env-only
    // QONTOCTL_ACCESS_TOKEN with no file `oauth` section), leave
    // `result.oauth` as-is. The downstream NO_CREDS error then
    // accurately reflects what the resolver actually saw.
    if (
      mergedClientId !== undefined &&
      mergedClientId !== "" &&
      mergedClientSecret !== undefined &&
      mergedClientSecret !== ""
    ) {
      result = {
        ...result,
        oauth: {
          clientId: mergedClientId,
          clientSecret: mergedClientSecret,
          ...(mergedAccessToken !== undefined ? { accessToken: mergedAccessToken } : {}),
          ...(existing?.stagingToken !== undefined ? { stagingToken: existing.stagingToken } : {}),
        },
      };
    }
  }

  if (endpoint !== undefined) {
    result = { ...result, endpoint };
  }

  if (stagingToken !== undefined) {
    const existingOAuth = result.oauth;
    // Mirror the partial-overlay-on-loaded-file rule: a staging token is
    // only meaningful in the context of full OAuth credentials. Without
    // resolvable client-id + client-secret, attaching a staging token
    // would synthesize an unusable oauth block — surface NO_CREDS
    // downstream instead. When client creds ARE available (file or env),
    // attach the staging token onto the existing/synthesized oauth.
    if (existingOAuth !== undefined && existingOAuth.clientId !== "" && existingOAuth.clientSecret !== "") {
      result = {
        ...result,
        oauth: {
          ...existingOAuth,
          stagingToken,
        },
      };
    }
  }

  if (scaMethod !== undefined) {
    result = { ...result, sca: { ...result.sca, method: scaMethod } };
  }

  if (authPreference !== undefined && (AUTH_PREFERENCES as readonly string[]).includes(authPreference)) {
    // Silently ignore invalid env values — env-overlay is forgiving by design
    // (the hard validation lives in the CLI's `--auth` choices() check).
    // This mirrors the SCA method behavior where free-form values pass through.
    result = { ...result, auth: { ...result.auth, preference: authPreference as AuthPreference } };
  }

  return { config: result, accessTokenFromEnv: accessToken !== undefined };
}

function buildPrefix(profile: string | undefined): string {
  if (profile === undefined) {
    return ENV_PREFIX;
  }
  const normalized = profile.toUpperCase().replaceAll("-", "_");
  return `${ENV_PREFIX}_${normalized}`;
}
