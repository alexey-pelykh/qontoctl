// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

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
}

/**
 * Execute an operation with automatic SCA handling.
 *
 * If the operation triggers a 428 response (SCA required), this function:
 * 1. Extracts the SCA session token
 * 2. Polls the SCA session until resolved
 * 3. Retries the original operation with the SCA token
 *
 * @param client - HttpClient used for SCA session polling
 * @param operation - Function that performs the API operation. Called with an optional
 *   SCA session token for retry.
 * @param options - Callbacks and polling options
 */
export async function executeWithSca<T>(
  client: HttpClient,
  operation: (scaSessionToken?: string) => Promise<T>,
  options?: ExecuteWithScaOptions,
): Promise<T> {
  try {
    return await operation();
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

    return operation(scaSessionToken);
  }
}
