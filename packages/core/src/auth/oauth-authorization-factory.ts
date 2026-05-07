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
  /**
   * When `true`, the access token is treated as **read-only /
   * discard-after-use**: proactive refresh is **not** attempted, and
   * refreshed tokens are **not** persisted to disk. The current bearer is
   * returned for the duration of the invocation; if the token has already
   * expired the API surfaces a `401` to the caller.
   *
   * Set this when the access token came from `QONTOCTL_ACCESS_TOKEN` (or its
   * profile-scoped variant) — env-supplied tokens mirror `AWS_SESSION_TOKEN`
   * semantics: env carries an input the tool reads but never writes back.
   * See issue #495.
   *
   * Defaults to `false`.
   */
  readonly readOnly?: boolean;
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
 *
 * When the {@link CreateOAuthAuthorizationOptions.readOnly} flag is set,
 * proactive refresh is skipped entirely and tokens are never written to disk.
 * This is the contract for env-supplied access tokens (`QONTOCTL_ACCESS_TOKEN`):
 * the env value is honored as a single-invocation bearer; the file (if any)
 * is left untouched.
 */
export function createOAuthAuthorization(options: CreateOAuthAuthorizationOptions): () => Promise<string> {
  const { oauth, tokenUrl, profile, readOnly = false } = options;

  return async () => {
    if (!readOnly && oauth.accessTokenExpiresAt && oauth.refreshToken) {
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
