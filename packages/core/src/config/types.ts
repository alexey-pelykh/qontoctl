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
 * OAuth 2.0 credentials for authenticating with the Qonto API.
 */
export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  /** ISO 8601 timestamp of when the access token expires. */
  tokenExpiresAt?: string;
}

/**
 * Parsed configuration from a `.qontoctl.yaml` file.
 */
export interface QontoctlConfig {
  apiKey?: ApiKeyCredentials;
  oauth?: OAuthCredentials;
  endpoint?: string;
  sandbox?: boolean;
}

/**
 * Result of resolving configuration, including any warnings encountered.
 */
export interface ConfigResult {
  config: QontoctlConfig;
  /** Resolved API endpoint URL. */
  endpoint: string;
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
