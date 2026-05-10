// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CLI_PATH, firstTextFromMcpResult } from "./helpers.js";
import { cliEnv } from "./sandbox.js";

const execFileAsync = promisify(execFile);

/**
 * Pattern matching the SCA session polling URL the core HTTP client logs at
 * verbose level. Tokens are base64url, so they survive `encodeURIComponent`
 * unchanged and contain only `[A-Za-z0-9_-]`. Matches both the production
 * endpoint (`/v2/sca/sessions/{token}`) and the sandbox-only mocked endpoint
 * (`/v2/mocked_sca_sessions/{token}`) — see
 * `packages/core/src/sca/sca-service.ts#getScaSession` for the routing logic.
 */
export const SCA_POLL_URL_RE = /\/v2\/(?:sca\/sessions|mocked_sca_sessions)\/([A-Za-z0-9_-]+)(?=\s|$|\/)/;

/**
 * Pattern matching the literal `Session token: <token>` line emitted by the
 * MCP server's structured "SCA pending" response — see
 * `packages/mcp/src/sca.ts#formatScaPendingResponse`.
 */
export const SCA_PENDING_TOKEN_RE = /Session token: ([A-Za-z0-9_-]+)/;

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

export interface CliScaTrigger {
  /**
   * SCA session token captured mid-flight from the spawned CLI's verbose
   * stderr stream. Always a base64url string per
   * `packages/core/src/http-client.ts#extractScaSessionToken` — never the
   * literal `"unknown"` (#445 made that path throw).
   */
  readonly scaSessionToken: string;
  /** The spawned CLI child process; still running when this trigger is returned. */
  readonly child: ChildProcess;
  /** Resolves once the CLI exits, with collected stdout/stderr and the exit code. */
  readonly exitPromise: Promise<CliScaExit>;
}

export interface CliScaExit {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Spawn a CLI command that is expected to trigger SCA, and capture the SCA
 * session token mid-flight from the verbose-log stream.
 *
 * The CLI continues running and polling the SCA session — call
 * {@link approveAndRetryCli} to approve the captured token via the sandbox
 * `mock-decision` subcommand and await the CLI's completion.
 *
 * The returned `child` is left running with stdout/stderr drained into in-
 * memory buffers; the `exitPromise` resolves once the child exits.
 *
 * @param args CLI arguments **excluding** the binary path. `--verbose` is
 *   prepended automatically so the SCA polling URL appears on stderr.
 * @param options.timeoutMs Max time to wait for the SCA polling URL to
 *   appear in stderr. Defaults to 10 000 ms — typical sandbox VoP + transfer
 *   setup is well under 2 s, so 10 s leaves plenty of headroom while still
 *   failing fast when the SCA path was never engaged (e.g. a trusted-payee
 *   exemption was unexpectedly hit).
 */
export async function triggerScaCli(
  args: readonly string[],
  options: { timeoutMs?: number } = {},
): Promise<CliScaTrigger> {
  const timeoutMs = options.timeoutMs ?? 10_000;

  const child = spawn("node", [CLI_PATH, "--verbose", ...args], {
    env: cliEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let stderrBuffer = "";
  let scaSessionToken: string | undefined;
  let captureResolve: ((token: string) => void) | undefined;
  let captureReject: ((err: Error) => void) | undefined;
  const capturePromise = new Promise<string>((resolve, reject) => {
    captureResolve = resolve;
    captureReject = reject;
  });

  // `stdio: ["ignore", "pipe", "pipe"]` above guarantees both streams exist;
  // the spawn-overload result type narrows them to non-null Readables.
  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });

  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    if (scaSessionToken !== undefined) return;

    stderrBuffer += chunk;
    let nlIdx: number;
    while ((nlIdx = stderrBuffer.indexOf("\n")) !== -1) {
      const line = stderrBuffer.slice(0, nlIdx);
      stderrBuffer = stderrBuffer.slice(nlIdx + 1);
      if (scaSessionToken !== undefined) continue;

      const match = line.match(SCA_POLL_URL_RE);
      if (match !== null && match[1] !== undefined) {
        scaSessionToken = match[1];
        captureResolve?.(scaSessionToken);
      }
    }
  });

  const exitPromise = new Promise<CliScaExit>((resolveExit, rejectExit) => {
    child.on("error", rejectExit);
    child.on("close", (code) => {
      resolveExit({ stdout, stderr, exitCode: code ?? 1 });
    });
  });

  // Race the token capture against a timeout so a stuck CLI does not
  // hang the test suite indefinitely.
  const timer = setTimeout(() => {
    captureReject?.(
      new Error(
        `Timed out (${String(timeoutMs)}ms) waiting for SCA polling URL in CLI stderr.\n--- stderr ---\n${stderr}`,
      ),
    );
  }, timeoutMs);

  let token: string;
  try {
    token = await capturePromise;
  } catch (err) {
    // Don't leak a child process if we never captured a token.
    child.kill();
    throw err;
  } finally {
    clearTimeout(timer);
  }

  return { scaSessionToken: token, child, exitPromise };
}

/**
 * Approve (or deny) a previously-captured SCA session token via the sandbox
 * `mock-decision` subcommand, then await the originally-spawned CLI's exit.
 *
 * The CLI's internal SCA wrapper polls the session at a fixed interval,
 * observes the approval, and retries the original operation. This helper
 * returns once the spawned CLI exits with the retried operation's result.
 *
 * @param trigger The trigger returned by {@link triggerScaCli}.
 * @param decision `"allow"` or `"deny"`. Defaults to `"allow"`.
 * @param options.timeoutMs Override the default 25 s timeout on the
 *   `mock-decision` subprocess (the inner CLI's polling timeout is governed
 *   separately via `executeWithCliSca` defaults).
 */
export async function approveAndRetryCli(
  trigger: CliScaTrigger,
  decision: "allow" | "deny" = "allow",
  options: { timeoutMs?: number } = {},
): Promise<CliScaExit> {
  await execFileAsync("node", [CLI_PATH, "sca-session", "mock-decision", trigger.scaSessionToken, decision], {
    env: cliEnv(),
    timeout: options.timeoutMs ?? 25_000,
  });
  return trigger.exitPromise;
}

// ---------------------------------------------------------------------------
// MCP helpers
// ---------------------------------------------------------------------------

export interface McpScaTrigger {
  /**
   * SCA session token extracted from the structured "SCA required" pending
   * response. Always a base64url string captured from the literal
   * `Session token: <token>` line emitted by `formatScaPendingResponse` —
   * never the literal `"unknown"` (#445 made that path throw before any
   * pending response is emitted).
   */
  readonly scaSessionToken: string;
  /** Raw text of the SCA-pending response body (for assertion / debug). */
  readonly pendingText: string;
  /** MCP client used to issue the trigger and (later) the retry. */
  readonly client: Client;
  /** Tool name passed on the trigger call; reused on the retry. */
  readonly toolName: string;
  /**
   * Original tool arguments (without `wait` or `sca_session_token`) — captured
   * so {@link approveAndRetryMcp} can re-invoke with the same shape and let
   * PSD2 dynamic-linking succeed.
   */
  readonly args: Record<string, unknown>;
}

/**
 * Call an MCP write tool in two-step mode (default: `wait: false`) so the
 * server returns the SCA-pending response without blocking, and extract the
 * SCA session token from the `Session token: <token>` line.
 *
 * Pair with {@link approveAndRetryMcp} to approve the token via
 * `sca_session_mock_decision` and re-invoke the tool with `sca_session_token`
 * set so the operation lands.
 *
 * @param client MCP client connected to a CLI-spawned server.
 * @param toolName MCP write tool name (e.g. `"transfer_create"`).
 * @param args Tool arguments **excluding** `wait` and `sca_session_token` —
 *   those are managed by the helper. Args are captured into the returned
 *   trigger so the retry uses the same shape (PSD2 dynamic-linking binds the
 *   token to amount + payee).
 * @param options.wait Override the default `false` — pass a positive integer
 *   (1–120) to exercise the bounded-poll variant where the server polls
 *   inline for that many seconds before falling back to the pending response.
 *   Useful for tests that assert on the polling-timeout path specifically.
 */
export async function triggerScaMcp(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
  options: { wait?: number | false } = {},
): Promise<McpScaTrigger> {
  const wait = options.wait ?? false;
  const result = await client.callTool({
    name: toolName,
    arguments: { ...args, wait },
  });

  if (result.isError === true) {
    throw new Error(`MCP tool ${toolName} returned isError=true on trigger call:\n${JSON.stringify(result, null, 2)}`);
  }

  const pendingText = firstTextFromMcpResult(result as { content: unknown });
  if (!/^SCA required/.test(pendingText)) {
    throw new Error(`Expected SCA-pending response from ${toolName} (wait=${String(wait)}), got:\n${pendingText}`);
  }

  const tokenMatch = pendingText.match(SCA_PENDING_TOKEN_RE);
  if (tokenMatch === null || tokenMatch[1] === undefined) {
    throw new Error(`No "Session token: ..." line in SCA-pending response:\n${pendingText}`);
  }

  return {
    scaSessionToken: tokenMatch[1],
    pendingText,
    client,
    toolName,
    args,
  };
}

/**
 * Approve (or deny) a captured SCA session token via the
 * `sca_session_mock_decision` MCP tool, then re-invoke the original tool
 * with `sca_session_token` set so the operation succeeds (or fails on deny).
 *
 * The retry passes the trigger's original args verbatim plus the approved
 * token — PSD2 dynamic-linking binds the token to amount + payee, so any
 * shape change (#438 / `docs/security/sca-token-binding.md`) would cause
 * the retry to be rejected with `422 Not found`.
 *
 * Returns the raw `CallToolResult` of the retry so callers can decide whether
 * to assert success (`!isError && parseable JSON`) or failure (e.g. on deny).
 */
export async function approveAndRetryMcp(
  trigger: McpScaTrigger,
  decision: "allow" | "deny" = "allow",
): Promise<CallToolResult> {
  const approveResult = await trigger.client.callTool({
    name: "sca_session_mock_decision",
    arguments: { token: trigger.scaSessionToken, decision },
  });
  if (approveResult.isError === true) {
    throw new Error(`sca_session_mock_decision returned isError=true:\n${JSON.stringify(approveResult, null, 2)}`);
  }

  return (await trigger.client.callTool({
    name: trigger.toolName,
    arguments: { ...trigger.args, sca_session_token: trigger.scaSessionToken },
  })) as CallToolResult;
}
