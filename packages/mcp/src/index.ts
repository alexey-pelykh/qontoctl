#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  HttpClient,
  buildApiKeyAuthorization,
  buildOAuthAuthorization,
  resolveConfig,
  refreshAccessToken,
  saveOAuthTokens,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
  type Authorization,
} from "@qontoctl/core";
import { runStdioServer } from "./stdio.js";

await runStdioServer({
  getClient: async () => {
    const { config, endpoint } = await resolveConfig();

    let authorization: Authorization;

    if (config.oauth !== undefined && config.oauth.clientId !== "") {
      const oauth = config.oauth;
      const tokenUrl = config.sandbox === true ? OAUTH_TOKEN_SANDBOX_URL : OAUTH_TOKEN_URL;

      authorization = async () => {
        if (oauth.tokenExpiresAt && oauth.refreshToken) {
          const expiresAt = new Date(oauth.tokenExpiresAt);
          const now = new Date();
          if (expiresAt.getTime() - now.getTime() < 60_000) {
            const tokens = await refreshAccessToken(tokenUrl, oauth.clientId, oauth.clientSecret, oauth.refreshToken);
            oauth.accessToken = tokens.accessToken;
            if (tokens.refreshToken) {
              oauth.refreshToken = tokens.refreshToken;
            }
            oauth.tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

            await saveOAuthTokens({
              accessToken: oauth.accessToken,
              refreshToken: oauth.refreshToken,
              tokenExpiresAt: oauth.tokenExpiresAt,
            });
          }
        }

        return buildOAuthAuthorization(oauth);
      };
    } else if (config.apiKey !== undefined) {
      authorization = buildApiKeyAuthorization(config.apiKey);
    } else {
      throw new Error("No credentials found in configuration");
    }

    return new HttpClient({
      baseUrl: endpoint,
      authorization,
    });
  },
});
