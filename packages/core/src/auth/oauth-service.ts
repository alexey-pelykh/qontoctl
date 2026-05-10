// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { parseResponse } from "../response.js";
import { AuthError } from "./api-key.js";

/**
 * Error thrown when the OAuth refresh-token flow fails (e.g. the refresh
 * token has expired or been revoked, returning `invalid_grant` from the
 * authorization server, or a network error during the refresh request).
 *
 * Distinct from {@link AuthError} so the HTTP client can recognize this
 * specific failure class — pre-flight, before any API call is dispatched —
 * and advance to a fallback authorization (e.g., api-key) when the auth
 * chain configuration permits. Without a typed marker, the HTTP client
 * could not distinguish a refresh failure from any other `AuthError`
 * surfacing during header construction.
 *
 * Inherits from {@link AuthError} so existing `instanceof AuthError`
 * checks (and the broader `name === "AuthError"` lookups some callers
 * use) continue to match.
 *
 * See [#523](https://github.com/alexey-pelykh/qontoctl/issues/523) for the
 * incident this addresses: refresh-token expiry that previously caused
 * the CLI to fail entirely instead of falling back to api-key auth even
 * when api-key creds were configured.
 */
export class OAuthRefreshError extends AuthError {
  /**
   * Underlying error that caused the refresh failure (e.g. the original
   * `AuthError` from the token-endpoint response, or a network error). Useful
   * for surfacing actionable messages to the user without losing the original
   * cause chain.
   */
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "OAuthRefreshError";
    this.cause = cause;
  }
}

/**
 * Tokens returned from a successful OAuth token exchange or refresh.
 */
export interface OAuthTokens {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresIn: number;
  readonly tokenType: string;
}

/**
 * Exchanges an authorization code for access and refresh tokens.
 *
 * @param tokenUrl - The OAuth token endpoint URL
 * @param clientId - The OAuth client ID
 * @param clientSecret - The OAuth client secret
 * @param code - The authorization code received from the callback
 * @param redirectUri - The redirect URI used in the authorization request
 * @param codeVerifier - The PKCE code verifier (if PKCE was used)
 */
export async function exchangeCode(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
  stagingToken?: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  if (codeVerifier !== undefined) {
    body.set("code_verifier", codeVerifier);
  }

  return requestTokens(tokenUrl, body, stagingToken);
}

/**
 * Refreshes an access token using a refresh token.
 *
 * @param tokenUrl - The OAuth token endpoint URL
 * @param clientId - The OAuth client ID
 * @param clientSecret - The OAuth client secret
 * @param refreshToken - The refresh token
 *
 * @throws {OAuthRefreshError} when the token endpoint rejects the refresh
 *   request (e.g. `invalid_grant`) or the request fails for any other reason
 *   (network error, parse failure). The original cause is preserved on the
 *   thrown error so the HTTP client can advance to a fallback authorization
 *   without losing diagnostic information.
 */
export async function refreshAccessToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  stagingToken?: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  try {
    return await requestTokens(tokenUrl, body, stagingToken);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new OAuthRefreshError(`OAuth token refresh failed: ${detail}`, cause);
  }
}

/**
 * Revokes an OAuth token (access or refresh).
 *
 * @param revokeUrl - The OAuth revocation endpoint URL
 * @param clientId - The OAuth client ID
 * @param clientSecret - The OAuth client secret
 * @param token - The token to revoke
 */
export async function revokeToken(
  revokeUrl: string,
  clientId: string,
  clientSecret: string,
  token: string,
  stagingToken?: string,
): Promise<void> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    ...(stagingToken !== undefined ? { "X-Qonto-Staging-Token": stagingToken } : {}),
  };

  const response = await fetch(revokeUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await safeReadText(response);
    throw new AuthError(`Token revocation failed (${response.status}): ${text}`);
  }
}

interface TokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string | undefined;
  readonly expires_in: number;
  readonly token_type: string;
}

const TokenResponseSchema = z
  .object({
    access_token: z.string(),
    refresh_token: z.string().optional(),
    expires_in: z.number(),
    token_type: z.string(),
  })
  .strip() satisfies z.ZodType<TokenResponse>;

async function requestTokens(tokenUrl: string, body: URLSearchParams, stagingToken?: string): Promise<OAuthTokens> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    ...(stagingToken !== undefined ? { "X-Qonto-Staging-Token": stagingToken } : {}),
  };

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await safeReadText(response);
    throw new AuthError(`OAuth token request failed (${response.status}): ${text}`);
  }

  const data = parseResponse(TokenResponseSchema, await response.json(), tokenUrl);

  return {
    accessToken: data.access_token,
    ...(data.refresh_token !== undefined ? { refreshToken: data.refresh_token } : {}),
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  };
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "Unknown error";
  }
}
