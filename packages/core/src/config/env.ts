// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { QontoctlConfig } from "./types.js";

const ENV_PREFIX = "QONTOCTL";
const ORG_SLUG_SUFFIX = "ORGANIZATION_SLUG";
const SECRET_KEY_SUFFIX = "SECRET_KEY";

/**
 * Overlays environment variables onto a config.
 *
 * - Without profile: reads `QONTOCTL_ORGANIZATION_SLUG` and `QONTOCTL_SECRET_KEY`
 * - With profile: reads `QONTOCTL_{PROFILE}_ORGANIZATION_SLUG` and
 *   `QONTOCTL_{PROFILE}_SECRET_KEY` (profile name uppercased, hyphens→underscores)
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

  if (orgSlug === undefined && secretKey === undefined) {
    return config;
  }

  const existing = config.apiKey;

  return {
    ...config,
    apiKey: {
      organizationSlug: orgSlug ?? existing?.organizationSlug ?? "",
      secretKey: secretKey ?? existing?.secretKey ?? "",
    },
  };
}

function buildPrefix(profile: string | undefined): string {
  if (profile === undefined) {
    return ENV_PREFIX;
  }
  const normalized = profile.toUpperCase().replaceAll("-", "_");
  return `${ENV_PREFIX}_${normalized}`;
}
