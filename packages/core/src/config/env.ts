// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { QontoctlConfig } from "./types.js";

const ENV_PREFIX = "QONTOCTL";
const ORG_SLUG_SUFFIX = "ORGANIZATION_SLUG";
const SECRET_KEY_SUFFIX = "SECRET_KEY";
const ENDPOINT_SUFFIX = "ENDPOINT";
const CLIENT_ID_SUFFIX = "CLIENT_ID";
const CLIENT_SECRET_SUFFIX = "CLIENT_SECRET";
const ACCESS_TOKEN_SUFFIX = "ACCESS_TOKEN";
const REFRESH_TOKEN_SUFFIX = "REFRESH_TOKEN";
const STAGING_TOKEN_SUFFIX = "STAGING_TOKEN";
const SCA_METHOD_SUFFIX = "SCA_METHOD";

/**
 * Overlays environment variables onto a config.
 *
 * - Without profile: reads `QONTOCTL_ORGANIZATION_SLUG`, `QONTOCTL_SECRET_KEY`,
 *   `QONTOCTL_ENDPOINT`, `QONTOCTL_CLIENT_ID`, `QONTOCTL_CLIENT_SECRET`,
 *   `QONTOCTL_ACCESS_TOKEN`, `QONTOCTL_REFRESH_TOKEN`, `QONTOCTL_STAGING_TOKEN`,
 *   and `QONTOCTL_SCA_METHOD`
 * - With profile: reads `QONTOCTL_{PROFILE}_ORGANIZATION_SLUG`,
 *   `QONTOCTL_{PROFILE}_SECRET_KEY`, `QONTOCTL_{PROFILE}_ENDPOINT`,
 *   `QONTOCTL_{PROFILE}_CLIENT_ID`, `QONTOCTL_{PROFILE}_CLIENT_SECRET`,
 *   `QONTOCTL_{PROFILE}_ACCESS_TOKEN`, `QONTOCTL_{PROFILE}_REFRESH_TOKEN`,
 *   `QONTOCTL_{PROFILE}_STAGING_TOKEN`, and `QONTOCTL_{PROFILE}_SCA_METHOD`
 *   (profile name uppercased, hyphens→underscores)
 *
 * Env vars take precedence over file values.
 */
export function applyEnvOverlay(
  config: QontoctlConfig,
  options?: {
    profile?: string | undefined;
    env?: Record<string, string | undefined> | undefined;
  },
): QontoctlConfig {
  const env = options?.env ?? (process.env as Record<string, string | undefined>);
  const prefix = buildPrefix(options?.profile);

  const orgSlug = env[`${prefix}_${ORG_SLUG_SUFFIX}`];
  const secretKey = env[`${prefix}_${SECRET_KEY_SUFFIX}`];
  const endpoint = env[`${prefix}_${ENDPOINT_SUFFIX}`];
  const clientId = env[`${prefix}_${CLIENT_ID_SUFFIX}`];
  const clientSecret = env[`${prefix}_${CLIENT_SECRET_SUFFIX}`];
  const accessToken = env[`${prefix}_${ACCESS_TOKEN_SUFFIX}`];
  const refreshToken = env[`${prefix}_${REFRESH_TOKEN_SUFFIX}`];
  const stagingToken = env[`${prefix}_${STAGING_TOKEN_SUFFIX}`];
  const scaMethod = env[`${prefix}_${SCA_METHOD_SUFFIX}`];

  let result = config;

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

  if (clientId !== undefined || clientSecret !== undefined || accessToken !== undefined || refreshToken !== undefined) {
    const existing = result.oauth;
    const mergedAccessToken = accessToken ?? existing?.accessToken;
    const mergedRefreshToken = refreshToken ?? existing?.refreshToken;
    result = {
      ...result,
      oauth: {
        clientId: clientId ?? existing?.clientId ?? "",
        clientSecret: clientSecret ?? existing?.clientSecret ?? "",
        ...(mergedAccessToken !== undefined ? { accessToken: mergedAccessToken } : {}),
        ...(mergedRefreshToken !== undefined ? { refreshToken: mergedRefreshToken } : {}),
        ...(existing?.accessTokenExpiresAt !== undefined
          ? { accessTokenExpiresAt: existing.accessTokenExpiresAt }
          : {}),
        ...(existing?.scopes !== undefined ? { scopes: existing.scopes } : {}),
        ...(existing?.stagingToken !== undefined ? { stagingToken: existing.stagingToken } : {}),
      },
    };
  }

  if (endpoint !== undefined) {
    result = { ...result, endpoint };
  }

  if (stagingToken !== undefined) {
    const existingOAuth = result.oauth;
    result = {
      ...result,
      oauth: {
        clientId: existingOAuth?.clientId ?? "",
        clientSecret: existingOAuth?.clientSecret ?? "",
        ...(existingOAuth?.accessToken !== undefined ? { accessToken: existingOAuth.accessToken } : {}),
        ...(existingOAuth?.refreshToken !== undefined ? { refreshToken: existingOAuth.refreshToken } : {}),
        ...(existingOAuth?.accessTokenExpiresAt !== undefined
          ? { accessTokenExpiresAt: existingOAuth.accessTokenExpiresAt }
          : {}),
        ...(existingOAuth?.scopes !== undefined ? { scopes: existingOAuth.scopes } : {}),
        stagingToken,
      },
    };
  }

  if (scaMethod !== undefined) {
    result = { ...result, sca: { ...result.sca, method: scaMethod } };
  }

  return result;
}

function buildPrefix(profile: string | undefined): string {
  if (profile === undefined) {
    return ENV_PREFIX;
  }
  const normalized = profile.toUpperCase().replaceAll("-", "_");
  return `${ENV_PREFIX}_${normalized}`;
}
