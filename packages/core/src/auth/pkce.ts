// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomBytes, createHash } from "node:crypto";

/**
 * Generates a cryptographically random code verifier for PKCE.
 *
 * Returns a 43-character URL-safe Base64 string (per RFC 7636).
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Generates the code challenge from a code verifier using S256 method.
 *
 * @param verifier - The code verifier string
 * @returns Base64url-encoded SHA-256 hash of the verifier
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
