// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { spinner, type SpinnerResult } from "@clack/prompts";
import {
  executeWithSca,
  ScaTimeoutError,
  type ExecuteWithScaContext,
  type HttpClient,
  type PollScaSessionOptions,
} from "@qontoctl/core";

export interface CliScaOptions {
  readonly verbose?: boolean | undefined;
  /** Options for the SCA polling loop (interval, timeout, sleep stub for testing). */
  readonly poll?: PollScaSessionOptions | undefined;
  /** Spinner factory for testing. Defaults to clack's spinner(). */
  readonly createSpinner?: (() => SpinnerResult) | undefined;
  /**
   * Idempotency key forwarded to the operation. If not supplied, a UUID is
   * generated once and reused across both attempts (initial 428 + SCA retry).
   */
  readonly idempotencyKey?: string | undefined;
}

/**
 * Execute an operation with SCA handling and CLI-appropriate user feedback.
 *
 * When SCA is triggered:
 * - Starts a spinner prompting the user to approve on their mobile app
 * - Updates the spinner message with elapsed time on each poll
 * - On approval, stops the spinner with a success message
 * - On timeout, stops the spinner with an error message
 *
 * The operation receives a context carrying a stable idempotency key (shared
 * across the initial 428 attempt and the post-SCA retry) and an optional SCA
 * session token (set on retry). Callers MUST forward `context.idempotencyKey`
 * to the underlying API call so both wire requests carry the same
 * `X-Qonto-Idempotency-Key` header.
 *
 * @param client - HttpClient used for SCA session polling
 * @param operation - Function that performs the API operation. Receives a context
 *   with stable idempotency key and optional SCA session token (on retry).
 * @param options - Verbose flag, polling options, and optional idempotency key
 */
export async function executeWithCliSca<T>(
  client: HttpClient,
  operation: (context: ExecuteWithScaContext) => Promise<T>,
  options?: CliScaOptions,
): Promise<T> {
  let s: SpinnerResult | undefined;

  try {
    return await executeWithSca(client, operation, {
      onScaRequired: () => {
        s = (options?.createSpinner ?? spinner)();
        s.start("Waiting for SCA approval on your Qonto mobile app...");
      },
      onPoll: (_attempt, elapsedMs) => {
        const seconds = Math.round(elapsedMs / 1000);
        s?.message(`Waiting for SCA approval on your Qonto mobile app... (${seconds}s)`);
      },
      onScaApproved: () => {
        s?.stop("SCA approved");
      },
      poll: options?.poll,
      idempotencyKey: options?.idempotencyKey,
    });
  } catch (error: unknown) {
    if (s !== undefined) {
      if (error instanceof ScaTimeoutError) {
        s.error("SCA approval timed out");
      } else {
        s.error("SCA approval failed");
      }
    }
    throw error;
  }
}
