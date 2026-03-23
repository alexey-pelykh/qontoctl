// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { QontoctlConfig } from "./types.js";

const ENV_PREFIX = "QONTOCTL";
const ORG_SLUG_SUFFIX = "ORGANIZATION_SLUG";
const SECRET_KEY_SUFFIX = "SECRET_KEY";
const ENDPOINT_SUFFIX = "ENDPOINT";
const SANDBOX_SUFFIX = "SANDBOX";
const CLIENT_ID_SUFFIX = "CLIENT_ID";
const CLIENT_SECRET_SUFFIX = "CLIENT_SECRET";

/**
 * Overlays environment variables onto a config.
 *
 * - Without profile: reads `QONTOCTL_ORGANIZATION_SLUG`, `QONTOCTL_SECRET_KEY`,
 *   `QONTOCTL_ENDPOINT`, and `QONTOCTL_SANDBOX`
 * - With profile: reads `QONTOCTL_{PROFILE}_ORGANIZATION_SLUG`,
 *   `QONTOCTL_{PROFILE}_SECRET_KEY`, `QONTOCTL_{PROFILE}_ENDPOINT`, and
 *   `QONTOCTL_{PROFILE}_SANDBOX` (profile name uppercased, hyphens→underscores)
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
  const sandbox = env[`${prefix}_${SANDBOX_SUFFIX}`];
  const clientId = env[`${prefix}_${CLIENT_ID_SUFFIX}`];
  const clientSecret = env[`${prefix}_${CLIENT_SECRET_SUFFIX}`];

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

  if (clientId !== undefined || clientSecret !== undefined) {
    const existing = result.oauth;
    result = {
      ...result,
      oauth: {
        clientId: clientId ?? existing?.clientId ?? "",
        clientSecret: clientSecret ?? existing?.clientSecret ?? "",
        ...(existing?.accessToken !== undefined ? { accessToken: existing.accessToken } : {}),
        ...(existing?.refreshToken !== undefined ? { refreshToken: existing.refreshToken } : {}),
        ...(existing?.accessTokenExpiresAt !== undefined
          ? { accessTokenExpiresAt: existing.accessTokenExpiresAt }
          : {}),
        ...(existing?.scopes !== undefined ? { scopes: existing.scopes } : {}),
      },
    };
  }

  if (endpoint !== undefined) {
    result = { ...result, endpoint };
  }

  if (sandbox !== undefined) {
    result = { ...result, sandbox: sandbox === "1" || sandbox === "true" };
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
