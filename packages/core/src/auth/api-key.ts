// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { ApiKeyCredentials } from "../config/types.js";

/**
 * Error thrown when API key authentication fails due to missing or invalid credentials.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Builds the Authorization header value from API key credentials.
 *
 * The Qonto API uses a simple `{slug}:{key}` format (no Base64 encoding).
 *
 * @throws {AuthError} when credentials are missing or incomplete
 */
export function buildApiKeyAuthorization(credentials: ApiKeyCredentials): string {
  if (credentials.organizationSlug === "") {
    throw new AuthError("Missing organization slug in API key credentials");
  }

  if (credentials.secretKey === "") {
    throw new AuthError("Missing secret key in API key credentials");
  }

  return `${credentials.organizationSlug}:${credentials.secretKey}`;
}
