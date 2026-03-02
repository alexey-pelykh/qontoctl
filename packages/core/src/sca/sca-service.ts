// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import type { ScaSession, ScaSessionStatus } from "./types.js";
import { ScaDeniedError, ScaTimeoutError } from "./errors.js";

interface ScaSessionResponse {
  readonly sca_session: {
    readonly status: ScaSessionStatus;
  };
}

/**
 * Retrieve the current status of an SCA session.
 */
export async function getScaSession(client: HttpClient, token: string): Promise<ScaSession> {
  const response = await client.get<ScaSessionResponse>(
    `/v2/sca/sessions/${encodeURIComponent(token)}`,
  );
  return { token, status: response.sca_session.status };
}

/**
 * Simulate a user SCA decision in sandbox mode.
 */
export async function mockScaDecision(
  client: HttpClient,
  token: string,
  decision: "allow" | "deny",
): Promise<void> {
  await client.requestVoid("POST", `/v2/sca/sessions/mock/${encodeURIComponent(token)}/decision`, {
    body: { decision },
  });
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export interface PollScaSessionOptions {
  /** Interval between polling attempts in milliseconds. Defaults to 2000. */
  readonly intervalMs?: number | undefined;
  /** Maximum time to wait for SCA resolution in milliseconds. Defaults to 15 minutes. */
  readonly timeoutMs?: number | undefined;
  /** Callback invoked before each polling attempt. */
  readonly onPoll?: ((attempt: number, elapsedMs: number) => void) | undefined;
  /** Sleep function for testability. Defaults to setTimeout-based sleep. */
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

/**
 * Poll an SCA session until it resolves to `allow` or `deny`, or times out.
 *
 * @throws {ScaTimeoutError} if polling exceeds the configured timeout
 * @throws {ScaDeniedError} if the user denies the SCA request
 */
export async function pollScaSession(
  client: HttpClient,
  token: string,
  options?: PollScaSessionOptions,
): Promise<ScaSession> {
  const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleepFn = options?.sleep ?? defaultSleep;
  const startTime = Date.now();
  let attempt = 0;

  for (;;) {
    attempt++;
    const elapsedMs = Date.now() - startTime;

    if (elapsedMs >= timeoutMs) {
      throw new ScaTimeoutError(token, timeoutMs);
    }

    options?.onPoll?.(attempt, elapsedMs);

    const session = await getScaSession(client, token);

    if (session.status === "allow") {
      return session;
    }

    if (session.status === "deny") {
      throw new ScaDeniedError(token);
    }

    // Status is 'waiting' — sleep and retry
    await sleepFn(intervalMs);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
