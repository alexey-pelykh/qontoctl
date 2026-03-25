// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { OAuthCredentials } from "../config/types.js";
import { saveOAuthTokens } from "../config/index.js";
import { buildOAuthAuthorization } from "./oauth.js";
import { refreshAccessToken } from "./oauth-service.js";

/**
 * Options for {@link createOAuthAuthorization}.
 */
export interface CreateOAuthAuthorizationOptions {
  /** Mutable OAuth credentials (tokens are updated in-place on refresh). */
  readonly oauth: OAuthCredentials;
  /** OAuth token endpoint URL. */
  readonly tokenUrl: string;
  /** Optional profile name for persisting refreshed tokens. */
  readonly profile?: string | undefined;
}

/**
 * Creates an `Authorization` callback that proactively refreshes the OAuth
 * access token when it is about to expire (<60 s remaining).
 *
 * On successful refresh the new tokens are:
 * 1. Written back into the mutable `oauth` object (in-place).
 * 2. Persisted to disk via {@link saveOAuthTokens}.
 *
 * If no refresh token is available or the token is still fresh, the existing
 * access token is returned as-is.
 */
export function createOAuthAuthorization(options: CreateOAuthAuthorizationOptions): () => Promise<string> {
  const { oauth, tokenUrl, profile } = options;

  return async () => {
    if (oauth.accessTokenExpiresAt && oauth.refreshToken) {
      const expiresAt = new Date(oauth.accessTokenExpiresAt);
      const now = new Date();
      if (expiresAt.getTime() - now.getTime() < 60_000) {
        const tokens = await refreshAccessToken(
          tokenUrl,
          oauth.clientId,
          oauth.clientSecret,
          oauth.refreshToken,
          oauth.stagingToken,
        );
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
}
