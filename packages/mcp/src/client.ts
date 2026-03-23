// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  type Authorization,
  HttpClient,
  resolveConfig,
  buildApiKeyAuthorization,
  buildOAuthAuthorization,
  refreshAccessToken,
  saveOAuthTokens,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
  type HttpClientOptions,
} from "@qontoctl/core";

export interface ClientOptions {
  readonly profile?: string | undefined;
}

/**
 * Build an authenticated HttpClient from the user's qontoctl configuration.
 *
 * Resolution order follows @qontoctl/core: profile file -> default file -> env vars.
 * Endpoint is resolved from config (endpoint field, sandbox flag, or default production).
 *
 * Auth precedence: OAuth (with auto-refresh) > API key.
 */
export async function buildClient(options?: ClientOptions): Promise<HttpClient> {
  const { config, endpoint } = await resolveConfig({ profile: options?.profile });

  let authorization: Authorization;
  let fallbackAuthorization: Authorization | undefined;

  if (config.oauth !== undefined && config.oauth.clientId !== "") {
    const oauth = config.oauth;
    const tokenUrl = config.sandbox === true ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL;
    const profile = options?.profile;

    authorization = async () => {
      if (oauth.accessTokenExpiresAt && oauth.refreshToken) {
        const expiresAt = new Date(oauth.accessTokenExpiresAt);
        const now = new Date();
        if (expiresAt.getTime() - now.getTime() < 60_000) {
          const tokens = await refreshAccessToken(tokenUrl, oauth.clientId, oauth.clientSecret, oauth.refreshToken);
          oauth.accessToken = tokens.accessToken;
          if (tokens.refreshToken) {
            oauth.refreshToken = tokens.refreshToken;
          }
          oauth.accessTokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

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

  const clientOptions: HttpClientOptions = {
    baseUrl: endpoint,
    authorization,
    fallbackAuthorization,
    onFallback: (method, path) => {
      process.stderr.write(`Warning: OAuth authentication failed, falling back to API key for ${method} ${path}\n`);
    },
  };

  return new HttpClient(clientOptions);
}

export type ClientFactory = () => Promise<HttpClient>;
