// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { BulkTransferSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliEnv, hasOAuthCredentials, hasStagingToken } from "../sandbox.js";

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

// Local response-shape interface. Named distinctly from the core export
// `BulkTransferRecord`, which describes a single transfer item within a bulk
// request body — this interface describes the BulkTransfer record returned
// by the API (a job aggregate).
interface BulkTransferRecord {
  readonly id: string;
  readonly initiator_id: string;
  readonly total_count: number;
  readonly completed_count: number;
  readonly pending_count: number;
  readonly failed_count: number;
  readonly created_at: string;
  readonly updated_at: string;
}

describe.skipIf(!hasOAuthCredentials())("bulk-transfer CLI commands (e2e)", () => {
  describe("bulk-transfer list", () => {
    it("lists bulk transfers with default output", () => {
      const output = cli("bulk-transfer", "list", "--no-paginate");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const bulkTransfers = cliJson<BulkTransferRecord[]>("bulk-transfer", "list", "--no-paginate");
      expect(Array.isArray(bulkTransfers)).toBe(true);
      for (const item of bulkTransfers) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("total_count");
        expect(item).toHaveProperty("completed_count");
        expect(item).toHaveProperty("created_at");
      }
    });

    it("lists bulk transfers with pagination", () => {
      const bulkTransfers = cliJson<BulkTransferRecord[]>("bulk-transfer", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(bulkTransfers)).toBe(true);
      expect(bulkTransfers.length).toBeLessThanOrEqual(2);
    });
  });

  // SCA orchestration is required for bulk-transfer create against the Qonto
  // sandbox: the API issues a 428 with an `sca_session_token`, the CLI polls
  // `/v2/sca/sessions/{token}` waiting for `allow`/`deny`, and a separate
  // process must call `sca-session mock-decision <token> allow` to unblock
  // polling. Skip when the staging token (sandbox routing) is absent.
  describe.skipIf(!hasStagingToken())("bulk-transfer create (sandbox SCA)", () => {
    it("creates a bulk transfer from a JSON file with SCA mock-decision orchestration", async () => {
      const beneficiaries = cliJson<{ id: string }[]>("beneficiary", "list", "--no-paginate", "--per-page", "1");
      if (beneficiaries.length === 0) return;
      const beneficiaryId = (beneficiaries[0] as { id: string }).id;

      const accounts = cliJson<{ id: string }[]>("account", "list");
      if (accounts.length === 0) return;
      const accountId = (accounts[0] as { id: string }).id;

      const tmpDir = mkdtempSync(join(tmpdir(), "qontoctl-e2e-"));
      const filePath = join(tmpDir, "transfers.json");
      writeFileSync(
        filePath,
        JSON.stringify([{ beneficiary_id: beneficiaryId, amount: "1.00", reference: "e2e-bulk-test" }]),
      );

      try {
        const child = spawn(
          "node",
          [
            CLI_PATH,
            "--verbose",
            "--output",
            "json",
            "bulk-transfer",
            "create",
            "--file",
            filePath,
            "--debit-account",
            accountId,
          ],
          { env: cliEnv(), stdio: ["ignore", "pipe", "pipe"] },
        );

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

        if (exitCode !== 0) {
          throw new Error(
            `bulk-transfer create exited ${String(exitCode)}\n--- stderr ---\n${stderr}\n--- stdout ---\n${stdout}`,
          );
        }

        expect(scaToken, "expected to capture SCA session token from polling URL").toBeDefined();
        if (approvePromise !== undefined) {
          await approvePromise;
        }

        expect(stderr).toMatch(/POST .*\/v2\/sepa\/bulk_transfers/);
        expect(stderr).toMatch(SCA_POLL_URL_RE);

        // Spinner ANSI sequences land in stdout alongside the final JSON.
        // Extract from the first `{` to the last `}` — the JSON output.
        const jsonStart = stdout.indexOf("{");
        const jsonEnd = stdout.lastIndexOf("}");
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error(`Expected JSON object in stdout, got: ${stdout}`);
        }
        const bt = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1)) as BulkTransferRecord;
        BulkTransferSchema.parse(bt);
        expect(bt).toHaveProperty("id");
        expect(bt).toHaveProperty("total_count");
        expect(bt.total_count).toBe(1);
      } finally {
        rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe("bulk-transfer show", () => {
    it("shows a bulk transfer by ID", () => {
      const bulkTransfers = cliJson<BulkTransferRecord[]>("bulk-transfer", "list", "--no-paginate");
      if (bulkTransfers.length === 0) return;

      const first = bulkTransfers[0] as BulkTransferRecord;

      const bt = cliJson<BulkTransferRecord>("bulk-transfer", "show", first.id);
      BulkTransferSchema.parse(bt);
      expect(bt.id).toBe(first.id);
      expect(bt).toHaveProperty("total_count");
      expect(bt).toHaveProperty("completed_count");
      expect(bt).toHaveProperty("pending_count");
      expect(bt).toHaveProperty("failed_count");
    });
  });
});
