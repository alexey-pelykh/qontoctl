// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  executeWithSca,
  QontoScaRequiredError,
  ScaDeniedError,
  ScaTimeoutError,
  type ExecuteWithScaContext,
  type HttpClient,
  type PollScaSessionOptions,
} from "@qontoctl/core";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_WAIT_SECONDS = 30;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const SCA_TOKEN_VALIDITY_MINUTES = 15;
const MAX_WAIT_SECONDS = 120;

/**
 * Zod schema fragment shared by every MCP write tool that participates
 * in SCA continuation. Spread into a tool's `inputSchema` alongside the
 * tool-specific fields.
 *
 * - `sca_session_token`: caller supplies a previously issued SCA session
 *   token to bind a prior approval to this retry. When set, no polling
 *   happens and the operation is invoked exactly once.
 * - `wait`: maximum seconds to poll inline for SCA approval (0-120).
 *   `false` (or omitted with `0`) disables polling so the tool returns
 *   a structured pending response immediately on a 428. Default 30.
 */
export const scaContinuationSchema = {
  sca_session_token: z
    .string()
    .optional()
    .describe(
      "SCA session token from a prior call to bind a previously approved SCA challenge to this retry. When set, no polling occurs and the operation runs exactly once with the token attached.",
    ),
  wait: z
    .union([z.number().int().min(0).max(MAX_WAIT_SECONDS), z.literal(false)])
    .optional()
    .describe(
      `Maximum seconds (0-${String(MAX_WAIT_SECONDS)}) to poll inline for SCA approval before returning a structured pending response. Use false or 0 for a pure two-step flow (return immediately on SCA required). Default 30.`,
    ),
};

/**
 * Translate the Zod-validated tool args into `McpScaOptions` for
 * `executeWithMcpSca`. Drops `undefined` keys per the project's
 * `exactOptionalPropertyTypes` discipline.
 */
export function scaOptionsFromArgs(args: {
  readonly sca_session_token?: string | undefined;
  readonly wait?: number | false | undefined;
}): McpScaOptions {
  return {
    ...(args.sca_session_token !== undefined ? { scaSessionToken: args.sca_session_token } : {}),
    ...(args.wait !== undefined ? { wait: args.wait } : {}),
  };
}

/**
 * Convert an `ExecuteWithScaContext` into the `{ idempotencyKey, scaSessionToken? }`
 * shape accepted by core service write functions, dropping the SCA token when
 * absent so it does not satisfy `exactOptionalPropertyTypes` checks. Used by
 * every wired tool to forward the wrapper's context to its underlying core call.
 */
export function coreOptionsFromContext(
  context: ExecuteWithScaContext,
): { readonly idempotencyKey: string; readonly scaSessionToken?: string } {
  return {
    idempotencyKey: context.idempotencyKey,
    ...(context.scaSessionToken !== undefined ? { scaSessionToken: context.scaSessionToken } : {}),
  };
}

export interface McpScaOptions {
  /**
   * Maximum seconds to poll for SCA approval before falling back to a
   * pending response. `false` or `0` disables polling entirely (pure
   * two-step flow). Defaults to 30. Tool-boundary callers should
   * Zod-enforce a max of 120 seconds.
   */
  readonly wait?: number | false | undefined;
  /**
   * Pre-existing SCA session token from a prior call that triggered SCA.
   * When supplied, the wrapper invokes the operation exactly once with
   * the token attached, performs no polling, and returns the result.
   * Use this to bind a previously approved SCA challenge to a retry.
   */
  readonly scaSessionToken?: string | undefined;
  /**
   * Idempotency key forwarded to the operation. If unset, a UUID is
   * generated once and shared across both wire attempts (initial 428 +
   * post-SCA retry) when polling is engaged.
   */
  readonly idempotencyKey?: string | undefined;
  /**
   * Polling overrides. `intervalMs` defaults to 3000; `timeoutMs` is
   * derived from `wait` and cannot be set here. `sleep` is the test seam
   * for mocked timers.
   */
  readonly poll?: Pick<PollScaSessionOptions, "intervalMs" | "sleep" | "onPoll"> | undefined;
}

/**
 * Execute an operation with SCA handling and MCP-appropriate response shaping.
 *
 * Three execution modes are selected by `options`:
 *
 * 1. **Pre-polled retry** (`options.scaSessionToken` is set): the operation
 *    is invoked exactly once with the supplied SCA token. No polling.
 * 2. **Pure two-step** (`options.wait` is `0` or `false`): the operation
 *    is invoked once. On 428 the wrapper returns a structured pending
 *    response immediately so the caller can poll out-of-band via
 *    `sca_session_show` and retry with the captured token.
 * 3. **Bounded poll** (`options.wait > 0`, the default): the wrapper
 *    delegates to `executeWithSca`, polling for up to `wait` seconds at
 *    a 3-second interval. On approval the operation is retried with the
 *    SCA token and the success result is formatted via `formatSuccess`.
 *    On poll timeout a structured pending response is returned so the
 *    caller can continue out-of-band. On user denial a structured denied
 *    response is returned (not an error — denial is a final user choice,
 *    not a programming fault).
 *
 * Non-SCA errors thrown by the operation propagate to the caller, where
 * `withClient` (in `errors.ts`) formats them as MCP error responses.
 *
 * @param client HttpClient used for SCA session polling.
 * @param operation Function performing the API call. Receives a context
 *   carrying the stable idempotency key and (on retry) the SCA session
 *   token. Callers MUST forward `context.idempotencyKey` to the underlying
 *   request so both wire attempts share an `X-Qonto-Idempotency-Key`.
 * @param formatSuccess Maps the operation's success value to a
 *   `CallToolResult`. Only invoked on a successful, non-SCA-pending result.
 * @param options Wait, scaSessionToken, idempotencyKey, and poll overrides.
 */
export async function executeWithMcpSca<T>(
  client: HttpClient,
  operation: (context: ExecuteWithScaContext) => Promise<T>,
  formatSuccess: (result: T) => CallToolResult,
  options?: McpScaOptions,
): Promise<CallToolResult> {
  const wait = options?.wait ?? DEFAULT_WAIT_SECONDS;

  if (options?.scaSessionToken !== undefined) {
    return invokeOnceAndFormat(operation, formatSuccess, {
      scaSessionToken: options.scaSessionToken,
      idempotencyKey: options.idempotencyKey ?? randomUUID(),
    });
  }

  if (wait === false || wait === 0) {
    return invokeOnceAndFormat(operation, formatSuccess, {
      idempotencyKey: options?.idempotencyKey ?? randomUUID(),
    });
  }

  try {
    const result = await executeWithSca(client, operation, {
      poll: {
        intervalMs: options?.poll?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS,
        timeoutMs: wait * 1000,
        ...(options?.poll?.sleep !== undefined ? { sleep: options.poll.sleep } : {}),
        ...(options?.poll?.onPoll !== undefined ? { onPoll: options.poll.onPoll } : {}),
      },
      ...(options?.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {}),
    });
    return formatSuccess(result);
  } catch (error: unknown) {
    if (error instanceof ScaTimeoutError) {
      return formatScaPendingResponse(error.scaSessionToken, wait);
    }
    if (error instanceof ScaDeniedError) {
      return formatScaDeniedResponse();
    }
    if (error instanceof QontoScaRequiredError) {
      return formatScaPendingResponse(error.scaSessionToken, false);
    }
    throw error;
  }
}

async function invokeOnceAndFormat<T>(
  operation: (context: ExecuteWithScaContext) => Promise<T>,
  formatSuccess: (result: T) => CallToolResult,
  context: ExecuteWithScaContext,
): Promise<CallToolResult> {
  try {
    const result = await operation(context);
    return formatSuccess(result);
  } catch (error: unknown) {
    if (error instanceof QontoScaRequiredError) {
      return formatScaPendingResponse(error.scaSessionToken, false);
    }
    throw error;
  }
}

/**
 * Build the structured "SCA pending" MCP response.
 *
 * The response carries the SCA session token, the polling situation
 * (whether an inline poll occurred and for how long), and instructions
 * for the user/LLM to continue out-of-band via the `sca_session_show`
 * tool and the per-tool `sca_session_token` continuation parameter.
 *
 * Exported so non-wrapper code paths (`withClient` fallback in
 * `errors.ts`) can return the same continuation-aware text shape
 * without importing the dead-end formatter.
 */
export function formatScaPendingResponse(token: string, wait: number | false): CallToolResult {
  const polledLine =
    wait === false || wait === 0
      ? "No inline poll was requested; the SCA session is pending the user's decision."
      : `Polled for ${String(wait)}s without resolution; the SCA session is still pending the user's decision.`;

  return {
    content: [
      {
        type: "text",
        text: [
          "SCA required. The user must approve this operation on their Qonto mobile app.",
          "",
          polledLine,
          "",
          `Session token: ${token}`,
          `Token validity: ${String(SCA_TOKEN_VALIDITY_MINUTES)} minutes from issuance.`,
          "",
          "To continue:",
          `  1. Poll the session status with the \`sca_session_show\` tool, passing token: "${token}".`,
          "  2. Once the status is `allow`, retry this tool with the same parameters PLUS",
          `     \`sca_session_token: "${token}"\` to bind the approval to this operation.`,
          "  3. Or call this tool again with a higher `wait` value (max 120 seconds) to poll inline.",
          "",
          "Note: PSD2 dynamic linking binds the session token to the original request",
          "parameters (amount, payee). Reusing the token for a different operation will be",
          "rejected by Qonto.",
        ].join("\n"),
      },
    ],
    isError: false,
  };
}

function formatScaDeniedResponse(): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: [
          "SCA denied. The user rejected the approval on their Qonto mobile app.",
          "",
          "The operation was not performed. To proceed, retry the tool to issue a fresh",
          "SCA challenge for the user to approve.",
        ].join("\n"),
      },
    ],
    isError: false,
  };
}
