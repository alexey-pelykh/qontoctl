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
 * Parsed configuration from a `.qontoctl.yaml` file.
 */
export interface QontoctlConfig {
  apiKey?: ApiKeyCredentials;
}

/**
 * Result of resolving configuration, including any warnings encountered.
 */
export interface ConfigResult {
  config: QontoctlConfig;
  warnings: string[];
}

/**
 * Options for resolving configuration.
 */
export interface ResolveOptions {
  /** Named profile to load from `~/.qontoctl/{profile}.yaml`. */
  profile?: string | undefined;
  /** Override CWD for file resolution (useful for testing). */
  cwd?: string | undefined;
  /** Override home directory for file resolution (useful for testing). */
  home?: string | undefined;
  /** Override environment variables (useful for testing). */
  env?: Record<string, string | undefined> | undefined;
}
