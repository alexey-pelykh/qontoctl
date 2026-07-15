// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { QontoScaRequiredError } from "../http-client.js";
import type { HttpClient } from "../http-client.js";
import { ScaDeniedError, ScaPollingFailedError, ScaTimeoutError } from "./errors.js";
import { mockScaDecision, pollScaSession, type PollScaSessionOptions } from "./sca-service.js";

export interface ExecuteWithScaCallbacks {
  /** Called when SCA is required, before polling starts. */
  readonly onScaRequired?: ((token: string) => void) | undefined;
  /** Called before each polling attempt. */
  readonly onPoll?: ((attempt: number, elapsedMs: number) => void) | undefined;
  /** Called when SCA is approved, before retrying the original request. */
  readonly onScaApproved?: (() => void) | undefined;
}

export interface ExecuteWithScaOptions extends ExecuteWithScaCallbacks {
  /** Options for the SCA polling loop. */
  readonly poll?: PollScaSessionOptions | undefined;
  /**
   * Idempotency key threaded to both the initial attempt and the SCA retry.
   * If not supplied, a UUID is generated once and reused across both attempts.
   *
   * Both HTTP attempts must carry the same `X-Qonto-Idempotency-Key` so the
   * Qonto API recognizes them as the same logical operation and does not
   * create duplicate pending pre-SCA records on retry.
   */
  readonly idempotencyKey?: string | undefined;
  /**
   * Sandbox-only: automatically fire a `mockScaDecision` against the captured
   * SCA session token before polling begins. When set, the supplied decision
   * (`"allow"` or `"deny"`) is POSTed to `/v2/mocked_sca_sessions/{token}/{decision}`
   * immediately after the SCA challenge is created, so the next poll observes
   * the resolved state without external orchestration.
   *
   * Callers are responsible for restricting use to sandbox-routed clients
   * (i.e. `client.isSandbox === true`). Outside sandbox, the mock-decision
   * endpoint does not exist and the call will fail with a 404 propagated to
   * the caller.
   */
  readonly autoApprove?: "allow" | "deny" | undefined;
}

/**
 * Context passed to the operation callback.
 *
 * The same `idempotencyKey` is used for both the initial 428 attempt and
 * the post-SCA retry, ensuring the operation is idempotent across the
 * SCA challenge.
 */
export interface ExecuteWithScaContext {
  /** SCA session token, populated only on the retry after SCA approval. */
  readonly scaSessionToken?: string | undefined;
  /** Stable idempotency key shared across the initial attempt and the SCA retry. */
  readonly idempotencyKey: string;
}

/**
 * Execute an operation with automatic SCA handling.
 *
 * If the operation triggers a 428 response (SCA required), this function:
 * 1. Extracts the SCA session token
 * 2. Polls the SCA session until resolved
 * 3. Retries the original operation with the SCA token
 *
 * Both attempts (initial 428 + post-SCA retry) receive the same idempotency
 * key via the context argument. Callers MUST forward `context.idempotencyKey`
 * to the underlying HTTP request so Qonto recognizes both attempts as the
 * same logical operation and does not create duplicate records.
 *
 * @param client - HttpClient used for SCA session polling
 * @param operation - Function that performs the API operation. Receives a context
 *   carrying the stable idempotency key and (on retry) the SCA session token.
 * @param options - Callbacks, polling options, and optional idempotency key
 */
export async function executeWithSca<T>(
  client: HttpClient,
  operation: (context: ExecuteWithScaContext) => Promise<T>,
  options?: ExecuteWithScaOptions,
): Promise<T> {
  const idempotencyKey = options?.idempotencyKey ?? randomUUID();

  try {
    return await operation({ idempotencyKey });
  } catch (error: unknown) {
    if (!(error instanceof QontoScaRequiredError)) {
      throw error;
    }

    const { scaSessionToken } = error;
    options?.onScaRequired?.(scaSessionToken);

    if (options?.autoApprove !== undefined) {
      await mockScaDecision(client, scaSessionToken, options.autoApprove);
    }

    try {
      await pollScaSession(client, scaSessionToken, {
        ...options?.poll,
        onPoll: options?.onPoll ?? options?.poll?.onPoll,
      });
    } catch (pollError: unknown) {
      // `deny` and `timeout` are *resolved* poll outcomes callers already
      // handle (final user choice / exhausted wait budget) — propagate them
      // unchanged.
      if (pollError instanceof ScaDeniedError || pollError instanceof ScaTimeoutError) {
        throw pollError;
      }
      // Anything else means the poll itself broke — e.g. the production
      // SCA-session status endpoint (`GET /v2/sca/sessions/{token}`) returning
      // a gateway 404 (see #669). The SCA challenge was already created and a
      // push delivered to the user's device, so a raw failure here loses the
      // token and strands them with an orphaned challenge behind a bare
      // "not_found". Preserve the token + cause so callers can surface
      // actionable recovery. Does NOT touch the polling URL / retry itself —
      // this only makes the failure recoverable, not the poll succeed.
      throw new ScaPollingFailedError(scaSessionToken, pollError);
    }

    options?.onScaApproved?.();

    return operation({ scaSessionToken, idempotencyKey });
  }
}
