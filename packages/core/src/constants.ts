// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/** Production API base URL. */
export const API_BASE_URL = "https://thirdparty.qonto.com";

/** Staging API base URL (used when staging-token is configured). */
export const SANDBOX_BASE_URL = "https://thirdparty-sandbox.staging.qonto.co";

/** Configuration directory name under the user's home directory. */
export const CONFIG_DIR = ".qontoctl";

/** Production OAuth authorization endpoint. */
export const OAUTH_AUTH_URL = "https://oauth.qonto.com/oauth2/auth";

/** Staging OAuth authorization endpoint (used when staging-token is configured). */
export const OAUTH_AUTH_SANDBOX_URL = "https://oauth-sandbox.staging.qonto.co/oauth2/auth";

/** Production OAuth token endpoint. */
export const OAUTH_TOKEN_URL = "https://oauth.qonto.com/oauth2/token";

/** Staging OAuth token endpoint (used when staging-token is configured). */
export const OAUTH_TOKEN_SANDBOX_URL = "https://oauth-sandbox.staging.qonto.co/oauth2/token";

/** Production OAuth revocation endpoint. */
export const OAUTH_REVOKE_URL = "https://oauth.qonto.com/oauth2/revoke";

/** Staging OAuth revocation endpoint (used when staging-token is configured). */
export const OAUTH_REVOKE_SANDBOX_URL = "https://oauth-sandbox.staging.qonto.co/oauth2/revoke";
