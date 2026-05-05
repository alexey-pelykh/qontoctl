// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Error thrown when SCA polling exceeds the maximum allowed time.
 *
 * The session token is intentionally omitted from `.message` to avoid
 * leaking it through generic error logging. Callers needing the token
 * for retry or diagnostics can read `.scaSessionToken` directly.
 */
export class ScaTimeoutError extends Error {
  constructor(
    public readonly scaSessionToken: string,
    public readonly timeoutMs: number,
  ) {
    super(`SCA session timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = "ScaTimeoutError";
  }
}

/**
 * Error thrown when the user denies the SCA request.
 *
 * The session token is intentionally omitted from `.message` to avoid
 * leaking it through generic error logging. Callers needing the token
 * for retry or diagnostics can read `.scaSessionToken` directly.
 */
export class ScaDeniedError extends Error {
  constructor(public readonly scaSessionToken: string) {
    super(`SCA request denied by user`);
    this.name = "ScaDeniedError";
  }
}
