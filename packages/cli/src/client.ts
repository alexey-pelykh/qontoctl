// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  type Authorization,
  type HttpClientLogger,
  HttpClient,
  resolveConfig,
  buildApiKeyAuthorization,
  buildOAuthAuthorization,
  refreshAccessToken,
  saveOAuthTokens,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
} from "@qontoctl/core";
import type { GlobalOptions } from "./options.js";

/**
 * Create an authenticated HttpClient from global CLI options.
 *
 * Resolves configuration (profile, env), builds the authorization
 * header, and uses the resolved endpoint.
 *
 * Auth precedence: OAuth (with auto-refresh) > API key.
 */
export async function createClient(options: GlobalOptions): Promise<HttpClient> {
  const { config, endpoint, warnings } = await resolveConfig({
    profile: options.profile,
  });

  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }

  let authorization: Authorization;
  let fallbackAuthorization: Authorization | undefined;

  if (config.oauth !== undefined && config.oauth.clientId !== "" && config.oauth.accessToken !== undefined) {
    // OAuth: use dynamic authorization with auto-refresh (requires an active session)
    const oauth = config.oauth;
    const tokenUrl = config.sandbox === true ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL;
    const profile = options.profile;

    authorization = async () => {
      // Check if token is expired and refresh if needed
      if (oauth.accessTokenExpiresAt && oauth.refreshToken) {
        const expiresAt = new Date(oauth.accessTokenExpiresAt);
        const now = new Date();
        // Refresh 60 seconds before expiration
        if (expiresAt.getTime() - now.getTime() < 60_000) {
          const tokens = await refreshAccessToken(tokenUrl, oauth.clientId, oauth.clientSecret, oauth.refreshToken);
          oauth.accessToken = tokens.accessToken;
          if (tokens.refreshToken) {
            oauth.refreshToken = tokens.refreshToken;
          }
          oauth.accessTokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

          // Persist refreshed tokens
          await saveOAuthTokens(
            {
              accessToken: oauth.accessToken,
              refreshToken: oauth.refreshToken,
              accessTokenExpiresAt: oauth.accessTokenExpiresAt,
            },
            profile !== undefined ? { profile } : undefined,
          );
        }
      }

      return buildOAuthAuthorization(oauth);
    };

    // When OAuth is primary, fall back to API key if available
    if (config.apiKey !== undefined) {
      fallbackAuthorization = buildApiKeyAuthorization(config.apiKey);
    }
  } else if (config.apiKey !== undefined) {
    authorization = buildApiKeyAuthorization(config.apiKey);
  } else {
    throw new Error("No credentials found in configuration");
  }

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

  return new HttpClient({
    baseUrl: endpoint,
    authorization,
    fallbackAuthorization,
    onFallback: (method, path) => {
      process.stderr.write(`Warning: OAuth authentication failed, falling back to API key for ${method} ${path}\n`);
    },
    logger,
  });
}
