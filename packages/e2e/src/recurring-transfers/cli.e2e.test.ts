// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile, execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { RecurringTransferSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");
const execFileAsync = promisify(execFile);

/**
 * Pattern matching the SCA session polling URL the core HTTP client logs at
 * verbose level. Tokens are base64url. Matches both the production endpoint
 * (`/v2/sca/sessions/{token}`) and the sandbox-only mocked endpoint
 * (`/v2/mocked_sca_sessions/{token}`) — the core picks per `client.isSandbox`.
 */
const SCA_POLL_URL_RE = /\/v2\/(?:sca\/sessions|mocked_sca_sessions)\/([A-Za-z0-9_-]+)(?=\s|$|\/)/;

function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    stdio: "pipe",
  });
}

function cliJson<T>(...args: string[]): T {
  const output = cli(...args, "--output", "json");
  return JSON.parse(output) as T;
}

interface SpawnWithScaResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly scaToken: string | undefined;
}

/**
 * Spawn the CLI with `--verbose --output json` prepended, watch stderr for
 * the SCA session polling URL, and concurrently call `sca-session
 * mock-decision <token> allow` to unblock the polling loop. Returns once the
 * child exits and the approval call has settled. Mirrors the inline pattern
 * established by `bulk-transfers/cli.e2e.test.ts`.
 */
async function spawnWithScaApproval(...args: string[]): Promise<SpawnWithScaResult> {
  const child = spawn("node", [CLI_PATH, "--verbose", "--output", "json", ...args], {
    env: cliEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let stderrBuffer = "";
  let scaToken: string | undefined;
  let approvePromise: Promise<unknown> | undefined;

  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    if (scaToken !== undefined) return;

    stderrBuffer += chunk;
    let nlIdx: number;
    while ((nlIdx = stderrBuffer.indexOf("\n")) !== -1) {
      const line = stderrBuffer.slice(0, nlIdx);
      stderrBuffer = stderrBuffer.slice(nlIdx + 1);
      if (scaToken !== undefined) continue;
      const match = line.match(SCA_POLL_URL_RE);
      if (match !== null && match[1] !== undefined) {
        scaToken = match[1];
        approvePromise = execFileAsync("node", [CLI_PATH, "sca-session", "mock-decision", scaToken, "allow"], {
          env: cliEnv(),
          timeout: 25_000,
        });
        approvePromise.catch(() => {});
      }
    }
  });

  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    child.on("error", rejectExit);
    child.on("close", (code) => {
      resolveExit(code ?? 1);
    });
  });

  if (approvePromise !== undefined) {
    await approvePromise;
  }

  return { exitCode, stdout, stderr, scaToken };
}

/**
 * Extract the JSON payload from CLI stdout. Spinner ANSI sequences may land
 * alongside the final JSON when running with `--verbose`, so slice from the
 * first `{` to the last `}`.
 */
function parseCliJsonOutput<T>(stdout: string): T {
  const jsonStart = stdout.indexOf("{");
  const jsonEnd = stdout.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`Expected JSON object in stdout, got: ${stdout}`);
  }
  return JSON.parse(stdout.slice(jsonStart, jsonEnd + 1)) as T;
}

interface RecurringTransferItem {
  readonly id: string;
  readonly initiator_id: string;
  readonly bank_account_id: string;
  readonly amount: number;
  readonly amount_cents: number;
  readonly amount_currency: string;
  readonly beneficiary_id: string;
  readonly frequency: string;
  // `next_execution_date` is `null` after cancel; `status` is observed to be
  // omitted from sandbox responses. See `RecurringTransferSchema` in core.
  readonly next_execution_date: string | null;
  readonly status?: string;
}

describe.skipIf(!hasOAuthCredentials())("recurring-transfer CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("recurring-transfer list", () => {
    it("lists recurring transfers with default output", () => {
      const output = cli("recurring-transfer", "list", "--no-paginate");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const recurringTransfers = cliJson<RecurringTransferItem[]>("recurring-transfer", "list", "--no-paginate");
      expect(Array.isArray(recurringTransfers)).toBe(true);
      for (const item of recurringTransfers) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("amount");
        expect(item).toHaveProperty("frequency");
        // `status` is observed to be omitted from sandbox responses and is
        // therefore optional in the schema; we don't assert presence here.
      }
    });

    it("lists recurring transfers with pagination", () => {
      const recurringTransfers = cliJson<RecurringTransferItem[]>(
        "recurring-transfer",
        "list",
        "--per-page",
        "2",
        "--page",
        "1",
      );
      expect(Array.isArray(recurringTransfers)).toBe(true);
      expect(recurringTransfers.length).toBeLessThanOrEqual(2);
    });
  });

  describe("recurring-transfer show", () => {
    it("shows a recurring transfer by ID", () => {
      const recurringTransfers = cliJson<RecurringTransferItem[]>(
        "recurring-transfer",
        "list",
        "--no-paginate",
        "--per-page",
        "1",
      );
      const first = recurringTransfers[0];
      if (first === undefined) return;

      const rt = cliJson<RecurringTransferItem>("recurring-transfer", "show", first.id);
      RecurringTransferSchema.parse(rt);
      expect(rt.id).toBe(first.id);
      expect(rt).toHaveProperty("amount");
      expect(rt).toHaveProperty("frequency");
      expect(rt).toHaveProperty("next_execution_date");
      // `status` is observed to be omitted from sandbox responses and is
      // therefore optional in the schema; we don't assert presence here.
    });
  });

  // SCA orchestration is required for recurring-transfer create against the
  // Qonto sandbox: the API issues a 428 with an `sca_session_token`, the CLI
  // polls `/v2/sca/sessions/{token}` waiting for `allow`/`deny`, and a
  // separate process must call `sca-session mock-decision <token> allow` to
  // unblock polling. Skip when the staging token (sandbox routing) is absent.
  describe.skipIf(!hasStagingToken())("recurring-transfer create (sandbox SCA)", () => {
    it("creates a recurring transfer with SCA mock-decision orchestration", async () => {
      const beneficiaries = cliJson<{ id: string }[]>("beneficiary", "list", "--no-paginate", "--per-page", "1");
      if (beneficiaries.length === 0) return;
      const beneficiaryId = (beneficiaries[0] as { id: string }).id;

      const accounts = cliJson<{ id: string }[]>("account", "list");
      if (accounts.length === 0) return;
      const accountId = (accounts[0] as { id: string }).id;

      const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const result = await spawnWithScaApproval(
        "recurring-transfer",
        "create",
        "--beneficiary",
        beneficiaryId,
        "--debit-account",
        accountId,
        "--amount",
        "1.00",
        "--currency",
        "EUR",
        "--reference",
        "e2e-recurring-test",
        "--start-date",
        futureDate,
        "--schedule",
        "monthly",
      );

      if (result.exitCode !== 0) {
        throw new Error(
          `recurring-transfer create exited ${String(result.exitCode)}\n--- stderr ---\n${result.stderr}\n--- stdout ---\n${result.stdout}`,
        );
      }

      expect(result.scaToken, "expected to capture SCA session token from polling URL").toBeDefined();
      expect(result.stderr).toMatch(/POST .*\/v2\/sepa\/recurring_transfers/);
      expect(result.stderr).toMatch(SCA_POLL_URL_RE);

      const rt = parseCliJsonOutput<RecurringTransferItem>(result.stdout);
      RecurringTransferSchema.parse(rt);
      expect(rt).toHaveProperty("id");
      expect(rt.frequency).toBe("monthly");
      expect(rt).toHaveProperty("beneficiary_id", beneficiaryId);
    });
  });

  // Cancel exercises both create (write) and cancel (write) — both require
  // SCA approval against the sandbox. Each spawn handles its own SCA
  // orchestration independently (two child processes, two approvals).
  describe.skipIf(!hasStagingToken())("recurring-transfer cancel (sandbox SCA)", () => {
    it("creates and then cancels a recurring transfer with SCA mock-decision orchestration", async () => {
      const beneficiaries = cliJson<{ id: string }[]>("beneficiary", "list", "--no-paginate", "--per-page", "1");
      if (beneficiaries.length === 0) return;
      const beneficiaryId = (beneficiaries[0] as { id: string }).id;

      const accounts = cliJson<{ id: string }[]>("account", "list");
      if (accounts.length === 0) return;
      const accountId = (accounts[0] as { id: string }).id;

      const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const createResult = await spawnWithScaApproval(
        "recurring-transfer",
        "create",
        "--beneficiary",
        beneficiaryId,
        "--debit-account",
        accountId,
        "--amount",
        "1.00",
        "--currency",
        "EUR",
        "--reference",
        "e2e-cancel-test",
        "--start-date",
        futureDate,
        "--schedule",
        "monthly",
      );

      if (createResult.exitCode !== 0) {
        throw new Error(
          `recurring-transfer create exited ${String(createResult.exitCode)}\n--- stderr ---\n${createResult.stderr}\n--- stdout ---\n${createResult.stdout}`,
        );
      }

      expect(createResult.scaToken, "expected SCA token during create").toBeDefined();
      const created = parseCliJsonOutput<RecurringTransferItem>(createResult.stdout);
      expect(created).toHaveProperty("id");

      const cancelResult = await spawnWithScaApproval("recurring-transfer", "cancel", created.id, "--yes");

      if (cancelResult.exitCode !== 0) {
        throw new Error(
          `recurring-transfer cancel exited ${String(cancelResult.exitCode)}\n--- stderr ---\n${cancelResult.stderr}\n--- stdout ---\n${cancelResult.stdout}`,
        );
      }

      // Cancel may or may not trigger SCA against the sandbox — the API has
      // been observed to return 204 directly after a recently-SCA-approved
      // create. We don't assert `scaToken` is defined: `spawnWithScaApproval`
      // gracefully handles the no-SCA path (the spawned `mock-decision` call
      // is only made if the polling URL appears on stderr). Mirrors the MCP
      // analogue, which also doesn't orchestrate SCA on cancel.
      const canceled = parseCliJsonOutput<{ canceled: boolean; id: string }>(cancelResult.stdout);
      expect(canceled.canceled).toBe(true);
      expect(canceled.id).toBe(created.id);
    });
  });
});
