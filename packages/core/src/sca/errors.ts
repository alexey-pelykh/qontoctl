// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Error thrown when SCA polling exceeds the maximum allowed time.
 */
export class ScaTimeoutError extends Error {
  constructor(
    public readonly token: string,
    public readonly timeoutMs: number,
  ) {
    super(`SCA session timed out after ${Math.round(timeoutMs / 1000)}s (token: ${token})`);
    this.name = "ScaTimeoutError";
  }
}

/**
 * Error thrown when the user denies the SCA request.
 */
export class ScaDeniedError extends Error {
  constructor(public readonly token: string) {
    super(`SCA request denied by user (token: ${token})`);
    this.name = "ScaDeniedError";
  }
}
