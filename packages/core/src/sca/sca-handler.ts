// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { QontoScaRequiredError } from "../http-client.js";
import type { HttpClient } from "../http-client.js";
import { pollScaSession, type PollScaSessionOptions } from "./sca-service.js";

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

    await pollScaSession(client, scaSessionToken, {
      ...options?.poll,
      onPoll: options?.onPoll ?? options?.poll?.onPoll,
    });

    options?.onScaApproved?.();

    return operation({ scaSessionToken, idempotencyKey });
  }
}
