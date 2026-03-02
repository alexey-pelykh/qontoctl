// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { OAuthCredentials } from "../config/types.js";
import { AuthError } from "./api-key.js";

/**
 * Builds the Authorization header value from OAuth credentials.
 *
 * Returns a `Bearer {access_token}` string for use as the Authorization header.
 *
 * @throws {AuthError} when no access token is available
 */
export function buildOAuthAuthorization(credentials: OAuthCredentials): string {
  if (!credentials.accessToken) {
    throw new AuthError('No OAuth access token available. Run "qontoctl auth login" first.');
  }

  return `Bearer ${credentials.accessToken}`;
}
