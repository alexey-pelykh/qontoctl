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

/**
 * Error thrown when the SCA challenge was created but its resolution could
 * NOT be confirmed because polling the SCA-session status endpoint itself
 * failed (e.g. a 404 / 5xx / network error while requesting the session
 * status) — as opposed to the poll running to a clean `deny`
 * ({@link ScaDeniedError}) or exhausting its budget ({@link ScaTimeoutError}).
 *
 * This distinction matters for callers: an infrastructure failure of the poll
 * is not fixed by waiting longer, and — critically for money-movement paths —
 * it strands the user with an *orphaned* challenge (a push was delivered to
 * their device, but approving it completes nothing). Preserving the
 * {@link scaSessionToken} here is what lets a caller surface actionable
 * recovery (approve on device, then retry binding the token) instead of a bare
 * "not_found". The originating error is kept in {@link cause} for diagnostics.
 *
 * The session token is intentionally omitted from `.message` to avoid leaking
 * it through generic error logging; callers read `.scaSessionToken` directly.
 */
export class ScaPollingFailedError extends Error {
  constructor(
    public readonly scaSessionToken: string,
    public override readonly cause: unknown,
  ) {
    super(`SCA session status could not be retrieved`);
    this.name = "ScaPollingFailedError";
  }
}
