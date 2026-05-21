// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { OAuthCredentials } from "../config/types.js";
import { AuthError } from "./api-key.js";

/**
 * Error thrown when OAuth credentials are present in config but no access
 * token is available — the user has configured an OAuth client but has not
 * yet completed an interactive `qontoctl auth login` to obtain a token.
 *
 * Subclass of {@link AuthError} so existing `instanceof AuthError` catch
 * sites continue to match, while the http-client (and other consumers) can
 * narrow to {@link OAuthNoTokenError} to distinguish "no token at all"
 * from "valid token but Qonto rejected it" or "configuration is malformed".
 *
 * Critically, this is the error class the http-client's auth-chain fallback
 * gate widens to cover (#631 PR2). Throwing the typed subclass — rather than
 * a plain {@link AuthError} — is what lets a `*-first` preference engage its
 * configured fallback authorization (typically api-key) when the OAuth side
 * has no usable token. Plain {@link AuthError} is reserved for genuine
 * configuration problems (e.g., empty `secret-key`) that the user MUST see
 * rather than have silently masked by a fallback.
 */
export class OAuthNoTokenError extends AuthError {
  constructor(message: string) {
    super(message);
    this.name = "OAuthNoTokenError";
  }
}

/**
 * Builds the Authorization header value from OAuth credentials.
 *
 * Returns a `Bearer {access_token}` string for use as the Authorization header.
 *
 * @throws {OAuthNoTokenError} when no access token is available. The typed
 *   subclass lets the http-client's auth-chain fallback gate distinguish
 *   "no token, please advance to fallback" from configuration errors (which
 *   must propagate).
 */
export function buildOAuthAuthorization(credentials: OAuthCredentials): string {
  if (!credentials.accessToken) {
    throw new OAuthNoTokenError('No OAuth access token available. Run "qontoctl auth login" first.');
  }

  return `Bearer ${credentials.accessToken}`;
}
