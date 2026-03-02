// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { executeWithSca, type HttpClient, type PollScaSessionOptions } from "@qontoctl/core";

export interface CliScaOptions {
  readonly verbose?: boolean | undefined;
  /** Options for the SCA polling loop (interval, timeout, sleep stub for testing). */
  readonly poll?: PollScaSessionOptions | undefined;
}

/**
 * Execute an operation with SCA handling and CLI-appropriate user feedback.
 *
 * When SCA is triggered:
 * - Displays a prompt instructing the user to approve on their mobile app
 * - In verbose mode, logs each polling attempt with elapsed time
 * - On approval, logs success and retries the operation
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
  return executeWithSca(client, operation, {
    onScaRequired: () => {
      process.stderr.write("SCA required. Please approve on your Qonto mobile app...\n");
    },
    onPoll:
      options?.verbose === true
        ? (attempt, elapsedMs) => {
            const seconds = Math.round(elapsedMs / 1000);
            process.stderr.write(`SCA polling attempt ${attempt} (${seconds}s elapsed)\n`);
          }
        : undefined,
    onScaApproved: () => {
      process.stderr.write("SCA approved. Retrying request...\n");
    },
    poll: options?.poll,
  });
}
