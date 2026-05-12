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
  /**
   * Sandbox-only auto-approve preference for SCA mock-decision.
   *
   * - When set to `"allow"` or `"deny"`: requires `client.isSandbox === true`
   *   — otherwise throws to enforce the production-rejection contract from
   *   `--sca-auto-approve`'s spec (#577). The supplied decision is POSTed to
   *   `/v2/mocked_sca_sessions/{token}/{decision}` immediately after the SCA
   *   challenge is created, so the next poll observes the resolved state
   *   without external orchestration.
   * - When unset AND `client.isMockSca === true` (staging-token configured +
   *   resolved `sca.method === "mock"`): auto-defaults to `"allow"` so
   *   sandbox writes complete in a single CLI invocation. Users opt into the
   *   deny path explicitly.
   * - When unset AND `client.isMockSca === false`: no auto-approve, the
   *   wrapper polls normally for the user's real-device approval.
   *
   * Production paths (no staging-token, `client.isSandbox === false`) reject
   * any non-undefined value at entry, before any wire requests are issued.
   */
  readonly scaAutoApprove?: "allow" | "deny" | undefined;
}

/**
 * Execute an operation with SCA handling and CLI-appropriate user feedback.
 *
 * When SCA is triggered:
 * - Starts a spinner prompting the user to approve on their mobile app
 *   (or "waiting for SCA mock-decision" when the sandbox mock path is active)
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
 * @param options - Verbose flag, polling options, optional idempotency key, and
 *   optional `scaAutoApprove` (sandbox-only — see {@link CliScaOptions.scaAutoApprove}).
 */
export async function executeWithCliSca<T>(
  client: HttpClient,
  operation: (context: ExecuteWithScaContext) => Promise<T>,
  options?: CliScaOptions,
): Promise<T> {
  // Sandbox-only gate (AC #2): reject `--sca-auto-approve` against production
  // clients up-front rather than waiting for Qonto to 404 the mock-decision
  // endpoint. The check is on `client.isSandbox` (staging-token presence) so
  // it covers both api-key and OAuth credentials routed through the sandbox.
  if (options?.scaAutoApprove !== undefined && !client.isSandbox) {
    throw new Error(
      "--sca-auto-approve is only available in the Qonto sandbox environment. " +
        "Configure `oauth.staging-token` in your config or set `QONTOCTL_STAGING_TOKEN`.",
    );
  }

  // Resolve the effective auto-approve decision. Precedence:
  //   1. Explicit `--sca-auto-approve allow|deny` from the caller.
  //   2. Auto-default to `"allow"` when the sandbox mock SCA path is active
  //      (AC #3) — i.e. staging-token configured AND resolved `sca.method`
  //      is `"mock"`. This makes sandbox writes work out-of-the-box.
  //   3. Otherwise: undefined (no auto-approve, normal polling for the
  //      user's mobile-app approval).
  const isMockSca = client.isMockSca;
  const autoApprove: "allow" | "deny" | undefined = options?.scaAutoApprove ?? (isMockSca ? "allow" : undefined);

  // Disambiguate spinner copy (AC #4). The mock path runs against the
  // sandbox `mocked_sca_sessions` endpoint, not the user's mobile app —
  // the original copy was misleading there. The mock-path copy still
  // applies even when `autoApprove` is set, because the first poll may
  // observe `"waiting"` for a few hundred ms while the mock-decision POST
  // propagates.
  const waitingMessage = isMockSca
    ? "Waiting for SCA mock-decision..."
    : "Waiting for SCA approval on your Qonto mobile app...";

  let s: SpinnerResult | undefined;

  try {
    return await executeWithSca(client, operation, {
      onScaRequired: () => {
        // Spinner writes to stderr (not the default stdout) so machine-readable
        // output modes (`--output json`, `--output yaml`) keep a clean stdout
        // — escape sequences and progress frames would otherwise corrupt the
        // structured payload (#491). stderr is the conventional channel for
        // progress indicators and is what interactive users already see.
        s = (options?.createSpinner ?? (() => spinner({ output: process.stderr })))();
        s.start(waitingMessage);
      },
      onPoll: (_attempt, elapsedMs) => {
        const seconds = Math.round(elapsedMs / 1000);
        s?.message(`${waitingMessage} (${seconds}s)`);
      },
      onScaApproved: () => {
        s?.stop("SCA approved");
      },
      poll: options?.poll,
      ...(autoApprove !== undefined ? { autoApprove } : {}),
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
