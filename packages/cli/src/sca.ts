// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { spinner, type SpinnerResult } from "@clack/prompts";
import { executeWithSca, ScaTimeoutError, type HttpClient, type PollScaSessionOptions } from "@qontoctl/core";

export interface CliScaOptions {
  readonly verbose?: boolean | undefined;
  /** Options for the SCA polling loop (interval, timeout, sleep stub for testing). */
  readonly poll?: PollScaSessionOptions | undefined;
  /** Spinner factory for testing. Defaults to clack's spinner(). */
  readonly createSpinner?: (() => SpinnerResult) | undefined;
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
 * @param client - HttpClient used for SCA session polling
 * @param operation - Function that performs the API operation. Called with an optional
 *   SCA session token for retry.
 * @param options - Verbose flag and polling options
 */
export async function executeWithCliSca<T>(
  client: HttpClient,
  operation: (scaSessionToken?: string) => Promise<T>,
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
