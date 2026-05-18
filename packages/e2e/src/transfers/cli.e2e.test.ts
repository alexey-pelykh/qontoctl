// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { TransferSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { CLI_PATH, cli, cliJson, skipMissingFixture } from "../helpers.js";
import {
  cliEnv,
  getTransferProofId,
  hasApiKeyCredentials,
  hasOAuthCredentials,
  hasStagingToken,
  hasTransferProofId,
  pinAuthPreference,
} from "../sandbox.js";
import { approveAndRetryCli, SCA_POLL_URL_RE, triggerScaCli } from "../sca-helpers.js";

const execFileAsync = promisify(execFile);

interface TransferItem {
  readonly id: string;
  readonly beneficiary_id: string;
  readonly amount: number;
  readonly amount_cents: number;
  readonly amount_currency: string;
  readonly status: "pending" | "processing" | "canceled" | "declined" | "settled";
  readonly reference: string;
  readonly note: string | null;
  readonly scheduled_date: string;
  readonly bank_account_id: string;
}

interface BeneficiaryListItem {
  readonly id: string;
  readonly name: string;
  readonly iban: string;
  readonly status: string;
  readonly trusted: boolean;
}

interface BankAccountItem {
  readonly id: string;
  readonly main: boolean;
  readonly balance_cents: number;
}

interface VopResultLite {
  readonly match_result: string;
  readonly matched_name: string | null;
  readonly proof_token: { readonly token: string };
}

interface BulkVopResultsLite {
  readonly requests: ReadonlyArray<{
    readonly id: string;
    readonly response?: VopResultLite;
    readonly error?: { readonly code: string };
  }>;
  readonly proof_token: { readonly token: string };
}

function firstTransfer(transfers: readonly TransferItem[]): TransferItem | undefined {
  return transfers[0];
}

describe.skipIf(!hasApiKeyCredentials())("transfer CLI commands (e2e)", () => {
  describe("transfer list", () => {
    it("lists transfers with default output", () => {
      const output = cli("transfer", "list", "--no-paginate");
      expect(output.length).toBeGreaterThan(0);
    });

    it("lists transfers as JSON", () => {
      const transfers = cliJson<TransferItem[]>("transfer", "list", "--no-paginate");
      expect(Array.isArray(transfers)).toBe(true);
      const t = firstTransfer(transfers);
      if (t !== undefined) {
        TransferSchema.parse(t);
        expect(t).toHaveProperty("id");
        expect(t).toHaveProperty("amount");
        expect(t).toHaveProperty("beneficiary_id");
        expect(t).toHaveProperty("status");
        expect(t).toHaveProperty("amount_currency");
      }
    });

    it("lists transfers with pagination", () => {
      const transfers = cliJson<TransferItem[]>("transfer", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(transfers)).toBe(true);
      expect(transfers.length).toBeLessThanOrEqual(2);
    });

    it("filters by status", () => {
      const transfers = cliJson<TransferItem[]>("transfer", "list", "--status", "settled", "--no-paginate");
      expect(Array.isArray(transfers)).toBe(true);
      for (const t of transfers) {
        expect(t.status).toBe("settled");
      }
    });

    it("outputs CSV format", () => {
      const output = cli("transfer", "list", "--output", "csv", "--no-paginate", "--per-page", "5");
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const header = lines[0] ?? "";
      expect(header).toContain("id");
      expect(header).toContain("amount");
      expect(header).toContain("status");
    });

    it("outputs YAML format", () => {
      const output = cli("transfer", "list", "--output", "yaml", "--no-paginate", "--per-page", "2");
      expect(output).toContain("id:");
    });

    it("outputs table format", () => {
      const output = cli("transfer", "list", "--output", "table", "--no-paginate", "--per-page", "2");
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe("transfer show", () => {
    it("shows a transfer by ID", (ctx) => {
      const transfers = cliJson<TransferItem[]>("transfer", "list", "--no-paginate", "--per-page", "1");
      const first = firstTransfer(transfers);
      if (first === undefined) {
        skipMissingFixture(ctx, "no transfers in sandbox to resolve an id for transfer show");
      }

      const transferId = first.id;
      const transfer = cliJson<TransferItem>("transfer", "show", transferId);
      TransferSchema.parse(transfer);
      expect(transfer.id).toBe(transferId);
      expect(transfer).toHaveProperty("amount");
      expect(transfer).toHaveProperty("beneficiary_id");
      expect(transfer).toHaveProperty("status");
      expect(transfer).toHaveProperty("amount_currency");
    });

    it("outputs transfer details as YAML", (ctx) => {
      const transfers = cliJson<TransferItem[]>("transfer", "list", "--no-paginate", "--per-page", "1");
      const first = firstTransfer(transfers);
      if (first === undefined) {
        skipMissingFixture(ctx, "no transfers in sandbox to resolve an id for transfer show YAML");
      }

      const transferId = first.id;
      const output = cli("transfer", "show", transferId, "--output", "yaml");
      expect(output).toContain("id:");
      expect(output).toContain(transferId);
    });
  });
});

// =============================================================================
// Non-SCA OAuth paths: verify-payee / bulk-verify-payee
// =============================================================================
//
// `verifyPayee` and `bulkVerifyPayee` are NOT SCA-gated under PSD2 — the
// endpoints respond 200 directly, never 428. CLI commands wrap with
// `executeWithCliSca` defensively (consistent with the rest of the transfer
// surface), but the wrap is a no-op since the API never challenges. The
// audit refresh for #458 confirmed this against the SCA-gated endpoint
// matrix; #449's original audit incorrectly flagged these as SCA-gated.
//
// `getTransferProof` is intentionally NOT covered in this block — see
// note below the SCA-gated block.

describe.skipIf(!hasOAuthCredentials())("transfer CLI commands (e2e, non-SCA OAuth paths)", () => {
  pinAuthPreference("oauth-first");

  describe("transfer verify-payee", () => {
    it("returns a VoP proof token for an existing beneficiary", () => {
      // VoP is a verification query — not state-changing on Qonto's side —
      // and is NOT SCA-gated. Its output `proof_token` binds the SCA token
      // of a subsequent `transfer create` per PSD2 dynamic-linking
      // (RTS Art. 5, `docs/security/sca-token-binding.md`); that binding
      // semantic is exercised end-to-end by
      // `packages/e2e/src/sca-continuation/cli.e2e.test.ts`. This test
      // covers only the proof-token shape from a standalone VoP call.
      const beneficiaries = cliJson<BeneficiaryListItem[]>("beneficiary", "list");
      const beneficiary = beneficiaries[0];
      if (beneficiary === undefined) {
        throw new Error("E2E setup: no beneficiaries in sandbox");
      }

      const result = cliJson<VopResultLite>(
        "transfer",
        "verify-payee",
        "--iban",
        beneficiary.iban,
        "--name",
        beneficiary.name,
      );
      // Qonto VoP proof tokens are pipe-delimited composites
      // (`version|attempt|epoch-ms|base64url-signature`) — they are NOT
      // bare base64url, so we assert only non-emptiness and a sanity
      // shape that excludes whitespace.
      expect(result.proof_token.token.length).toBeGreaterThan(0);
      expect(result.proof_token.token).toMatch(/^\S+$/);
      expect(typeof result.match_result).toBe("string");
    });
  });

  describe("transfer bulk-verify-payee", () => {
    it("returns proof token and per-entry results for a CSV batch", () => {
      const beneficiaries = cliJson<BeneficiaryListItem[]>("beneficiary", "list");
      const sample = beneficiaries.slice(0, 2);
      if (sample.length === 0) {
        throw new Error("E2E setup: no beneficiaries in sandbox");
      }

      const csv = ["iban,name", ...sample.map((b) => `${b.iban},${b.name}`)].join("\n");
      const csvDir = mkdtempSync(join(tmpdir(), "qontoctl-bulk-vop-e2e-"));
      const csvPath = join(csvDir, "entries.csv");
      try {
        writeFileSync(csvPath, csv, "utf-8");
        const result = cliJson<BulkVopResultsLite>("transfer", "bulk-verify-payee", "--file", csvPath);
        expect(result.proof_token.token.length).toBeGreaterThan(0);
        expect(result.proof_token.token).toMatch(/^\S+$/);
        expect(result.requests.length).toBe(sample.length);
        // Bulk VoP, like single VoP, is NOT SCA-gated.
      } finally {
        rmSync(csvDir, { recursive: true, force: true });
      }
    });
  });
});

// =============================================================================
// `transfer cancel` (with conditional-SCA outcome)
// =============================================================================
//
// `cancelTransfer` (POST /v2/sepa/transfers/{id}/cancel) was originally
// audited as SCA-gated, and the CLI / MCP code defensively wraps it with
// `executeWithCliSca` / `executeWithMcpSca`. Empirical probe against the
// Qonto sandbox (2026-05-12) shows the endpoint returns `204 No Content`
// DIRECTLY without any 428 challenge — i.e., the wrap is effectively a
// no-op for this endpoint in sandbox.
//
// This test uses the conditional-outcome pattern established in #549–#553:
// the create call (which IS reliably SCA-gated) runs through the standard
// `triggerScaCli` + `approveAndRetryCli` round-trip; the cancel call is
// run via a spawned-CLI probe that tolerates either path (SCA triggers, or
// direct success). If sandbox behavior shifts to start SCA-gating cancel,
// the test still passes and starts asserting on the polling URL.
//
// `createTransfer` is already covered with three variants by
// `packages/e2e/src/sca-continuation/cli.e2e.test.ts` (wait=false / wait=5 /
// wait=10). The create here is setup-for-cancel, not the operation under
// test.
//
// AUDIT AC #4 (#458, originally Notable Finding #2 in #449):
// "bulk-transfers and recurring-transfers create paths complete without SCA
// in sandbox" — REFUTED by existing tests:
//   - packages/e2e/src/bulk-transfers/cli.e2e.test.ts L71 (sandbox SCA)
//   - packages/e2e/src/recurring-transfers/cli.e2e.test.ts L180 (sandbox SCA)
//   - packages/e2e/src/recurring-transfers/cli.e2e.test.ts L232 (sandbox SCA)
// The original audit was wrong; no new probe is required for AC #4.

interface SpawnedCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly scaTriggered: boolean;
}

/**
 * Spawn a CLI command that MAY or MAY NOT trigger SCA — watch stderr for the
 * polling URL and, if seen, mock-approve the captured token; otherwise let
 * the command exit on its own. Mirrors the conditional-SCA helper from
 * `packages/e2e/src/beneficiaries/cli.e2e.test.ts` (#551) and is necessary
 * because empirical sandbox enforcement varies per endpoint.
 */
async function runWithConditionalSca(args: readonly string[]): Promise<SpawnedCliResult> {
  const child = spawn("node", [CLI_PATH, "--verbose", "--output", "json", ...args], {
    env: cliEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let stderrBuffer = "";
  let scaToken: string | undefined;
  let approvePromise: Promise<unknown> = Promise.resolve();

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
      }
    }
  });

  const exit = await new Promise<{ readonly code: number | null }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code });
    });
  });
  await approvePromise;

  return {
    stdout,
    stderr,
    exitCode: exit.code,
    scaTriggered: scaToken !== undefined,
  };
}

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("transfer CLI commands (e2e, SCA write paths)", () => {
  pinAuthPreference("oauth-first");

  it("transfer cancel: create + cancel lifecycle (cancel conditionally SCA-gated)", async () => {
    const beneficiaries = cliJson<BeneficiaryListItem[]>("beneficiary", "list");
    // PSD2 Article 13(b) trusted-beneficiary exemption — pick a non-trusted
    // beneficiary so the create call actually triggers SCA. Prefer
    // `validated && !trusted`; fall back to any non-trusted entry (typically
    // `pending`, whose first-use validation challenge exercises the same
    // client polling/retry code path). Same rationale as
    // `sca-continuation/cli.e2e.test.ts`.
    const beneficiary =
      beneficiaries.find((b) => b.status === "validated" && !b.trusted) ?? beneficiaries.find((b) => !b.trusted);
    if (beneficiary === undefined) {
      throw new Error(
        "E2E setup: no non-trusted beneficiaries available; need at least one untrusted beneficiary to trigger SCA on transfer create",
      );
    }

    const accounts = cliJson<BankAccountItem[]>("account", "list");
    // `main: true` account avoids `400 insufficient_funds` on the post-SCA
    // retry; fall back to highest-balance for defensive sandbox-config drift.
    const account = accounts.find((a) => a.main) ?? [...accounts].sort((a, b) => b.balance_cents - a.balance_cents)[0];
    if (account === undefined) {
      throw new Error("E2E setup: no bank accounts in sandbox");
    }

    // Pre-resolve VoP outside the SCA flow so the per-test budget isn't
    // burned on a separate verify-payee call inside the SCA polling window.
    const vop = cliJson<VopResultLite>(
      "transfer",
      "verify-payee",
      "--iban",
      beneficiary.iban,
      "--name",
      beneficiary.name,
    );
    const vopProofToken = vop.proof_token.token;

    // Schedule the transfer ~3 days into the future so it stays in
    // `pending` status and is cancellable. Without this, the sandbox
    // moves a freshly-created same-day transfer past the `pending` state
    // before the cancel SCA round-trip completes, and cancel returns
    // `400 cannot_cancel`. The 3-day buffer is generous against any
    // weekend / sandbox clock-skew.
    const scheduledDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

    // ---- Round-trip #1: create the transfer to cancel -------------------
    const reference = `e2e-sca-cancel-${randomUUID().slice(0, 12)}`;
    const createTrigger = await triggerScaCli([
      "--output",
      "json",
      "transfer",
      "create",
      "--beneficiary",
      beneficiary.id,
      "--debit-account",
      account.id,
      "--reference",
      reference,
      "--amount",
      "1.50",
      "--scheduled-date",
      scheduledDate,
      "--vop-proof-token",
      vopProofToken,
    ]);
    expect(createTrigger.scaSessionToken).not.toBe("unknown");
    expect(createTrigger.scaSessionToken).toMatch(/^[A-Za-z0-9_-]+$/);
    const createExit = await approveAndRetryCli(createTrigger, "allow");
    if (createExit.exitCode !== 0) {
      throw new Error(
        `transfer create exited ${String(createExit.exitCode)}\n--- stderr ---\n${createExit.stderr}\n--- stdout ---\n${createExit.stdout}`,
      );
    }
    const transfer = JSON.parse(createExit.stdout) as { readonly id: string };
    expect(transfer.id.length).toBeGreaterThan(0);

    // ---- Round-trip #2 (conditional): cancel the transfer ---------------
    // Cancel MAY trigger SCA (audit assumption) or MAY return 204 directly
    // (empirical sandbox behavior, 2026-05-12). The conditional helper
    // mock-approves if SCA fires and lets the command exit otherwise.
    const cancelResult = await runWithConditionalSca(["transfer", "cancel", transfer.id, "--yes"]);

    if (cancelResult.scaTriggered) {
      console.log(`[transfer cancel SCA probe] SCA triggered in OAuth+sandbox; round-trip exercised.`);
      expect(cancelResult.stderr).toMatch(SCA_POLL_URL_RE);
    } else {
      console.log(`[transfer cancel SCA probe] NO SCA in OAuth+sandbox for transfer cancel.`);
      expect(cancelResult.stderr).not.toMatch(SCA_POLL_URL_RE);
    }

    if (cancelResult.exitCode !== 0) {
      throw new Error(
        `transfer cancel exited ${String(cancelResult.exitCode)}\n--- stderr ---\n${cancelResult.stderr}\n--- stdout ---\n${cancelResult.stdout}`,
      );
    }
    // Wire-log evidence the cancel POST landed regardless of SCA path.
    expect(cancelResult.stderr).toMatch(/POST .*\/v2\/sepa\/transfers\/[^/]+\/cancel/);
    const cancelJson = JSON.parse(cancelResult.stdout) as {
      readonly canceled?: boolean;
      readonly id?: string;
    };
    expect(cancelJson.canceled).toBe(true);
    expect(cancelJson.id).toBe(transfer.id);
  });
});

// `getTransferProof` (CLI: `transfer proof`) is exercised against a
// production-org transfer because the Qonto sandbox simulator does not
// generate proof PDFs. Empirical probes against sandbox org
// `0909-future-club-2702` on 2026-05-12 and refreshed 2026-05-13:
// `GET /v2/sepa/transfers/{id}/proof` returned `404 not_found` for ALL
// most-recent `status: settled` transfers. The proof PDF is reliably
// generated post-settlement in production but not in sandbox.
//
// This block is opt-in: gated on `QONTOCTL_TRANSFER_PROOF_ID` (a
// known-good production-org SEPA transfer UUID whose proof has been
// generated). CI never sets the env var, so this block skips in CI;
// local devs opt in by exporting the env var alongside production
// credentials. See `docs/e2e-testing.md` § Production-org-gated tests.
// Tracked as #565.
describe.skipIf(!hasApiKeyCredentials() || !hasTransferProofId())(
  "transfer CLI commands (e2e, production-org proof — opt-in via QONTOCTL_TRANSFER_PROOF_ID)",
  () => {
    describe("transfer proof", () => {
      it("downloads a valid PDF to --output-file", () => {
        const id = getTransferProofId();
        const tmpDir = mkdtempSync(join(tmpdir(), "qontoctl-transfer-proof-"));
        const outputPath = join(tmpDir, "proof.pdf");
        try {
          // CLI prints `Downloaded: <path>` to stdout; we don't parse it,
          // we read the file back and assert PDF magic bytes + min size.
          cli("transfer", "proof", id, "--output-file", outputPath);
          const buffer = readFileSync(outputPath);
          // PDF magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D) per ISO 32000-1 §7.5.2;
          // the 6th byte is the version digit (e.g. "1" in "%PDF-1.7") which varies.
          expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
          // 1 KiB lower bound — Qonto proof PDFs include rendered SEPA
          // transfer details + branding; empirically several KiB. A
          // truncation or HTML-error-page response would be much smaller.
          expect(buffer.byteLength).toBeGreaterThan(1024);
        } finally {
          rmSync(tmpDir, { recursive: true, force: true });
        }
      });
    });
  },
);
