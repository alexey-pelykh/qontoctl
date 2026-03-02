// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { AuthError } from "./api-key.js";

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

  return requestTokens(tokenUrl, body);
}

/**
 * Refreshes an access token using a refresh token.
 *
 * @param tokenUrl - The OAuth token endpoint URL
 * @param clientId - The OAuth client ID
 * @param clientSecret - The OAuth client secret
 * @param refreshToken - The refresh token
 */
export async function refreshAccessToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  return requestTokens(tokenUrl, body);
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
): Promise<void> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token,
  });

  const response = await fetch(revokeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await safeReadText(response);
    throw new AuthError(`Token revocation failed (${response.status}): ${text}`);
  }
}

interface TokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in: number;
  readonly token_type: string;
}

async function requestTokens(tokenUrl: string, body: URLSearchParams): Promise<OAuthTokens> {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await safeReadText(response);
    throw new AuthError(`OAuth token request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as TokenResponse;

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
