// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CLI_PATH, cliJson } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_POLL_URL_RE } from "../sca-helpers.js";

const execFileAsync = promisify(execFile);

interface RequestItem {
  readonly id: string;
  readonly request_type: "flash_card" | "virtual_card" | "transfer" | "multi_transfer";
  readonly status: string;
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
  readonly iban: string;
  readonly main: boolean;
  readonly balance_cents: number;
}

interface SpawnedCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly scaTriggered: boolean;
}

/**
 * Spawn an SCA-gated CLI command and tolerate either path (SCA triggers, or
 * direct success). Watches stderr for the polling URL, mock-approves the
 * captured token if seen, and awaits exit. Identical structure to the
 * conditional-SCA helper in `packages/e2e/src/transfers/cli.e2e.test.ts`
 * (#554) and `packages/e2e/src/beneficiaries/cli.e2e.test.ts` (#551) —
 * necessary because empirical sandbox enforcement varies per endpoint.
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

// Empirical capability probe (2026-05-12 against sandbox `0909-future-club-2702`,
// OAuth token with `request_review.write`, `request_cards.write`, and
// `request_transfers.write` scopes ALL granted):
//
//   - `GET  /v2/requests`                                  → 200 OK (11 pending multi_transfer requests)
//   - `POST /v2/requests/multi_transfers`                  → 200 OK (works, NOT SCA-gated)
//   - `POST /v2/requests/flash_cards`                      → 403 Forbidden
//     (precondition: docs/qonto-sandbox-preconditions.md#post-v2-requests-flash-cards)
//   - `POST /v2/requests/virtual_cards`                    → 403 Forbidden
//     (precondition: docs/qonto-sandbox-preconditions.md#post-v2-requests-virtual-cards)
//   - `POST /v2/requests/multi_transfers/{id}/approve`     → 403 Forbidden
//     (precondition: docs/qonto-sandbox-preconditions.md#post-v2-requests-multi-transfers-id-approve)
//   - `POST /v2/requests/multi_transfers/{id}/decline`     → 403 Forbidden
//     (precondition: docs/qonto-sandbox-preconditions.md#post-v2-requests-multi-transfers-id-decline)
//
// The 4 sandbox-blocked endpoints (`flash_cards` create, `virtual_cards` create,
// approve, decline) return `403 unknown` despite all `request_*.write` scopes
// being present on the OAuth token — pointing to a sandbox-plan or
// admin-role limitation rather than auth misconfiguration. E2E coverage for
// the blocked four is deferred to a follow-up issue (linked in the README of
// this directory and in the deferral note at the bottom of this file).
//
// Per #551 user feedback ("graceful skip is BAD — bail out with error"),
// we do NOT add a conditional skip wrapper that would swallow these 403s
// silently. The covered test below exercises the one creation path that
// works against the sandbox; the others are documented as known blockers.

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("request CLI commands (e2e, SCA write paths)", () => {
  pinAuthPreference("oauth-first");

  it("request create-multi-transfer: create lifecycle (conditional SCA-gating)", async () => {
    // Multi-transfer requests need at least one transfer entry. Sandbox accepts
    // any beneficiary IBAN here — there's no SEPA execution at the request
    // stage; that only happens on subsequent approve (which sandbox blocks
    // with 403 — see header note).
    const beneficiaries = cliJson<BeneficiaryListItem[]>("beneficiary", "list");
    const beneficiary = beneficiaries[0];
    if (beneficiary === undefined) {
      throw new Error("E2E setup: no beneficiaries in sandbox");
    }
    const accounts = cliJson<BankAccountItem[]>("account", "list");
    const account = accounts.find((a) => a.main) ?? accounts[0];
    if (account === undefined) {
      throw new Error("E2E setup: no bank accounts in sandbox");
    }

    const note = `e2e-sca-mt-${randomUUID().slice(0, 12)}`;
    const transfers = [
      {
        amount: "1.00",
        currency: "EUR",
        credit_iban: beneficiary.iban,
        credit_account_name: beneficiary.name,
        credit_account_currency: "EUR",
        reference: note,
      },
    ];

    const jsonDir = mkdtempSync(join(tmpdir(), "qontoctl-mt-req-e2e-"));
    const jsonPath = join(jsonDir, "transfers.json");
    try {
      writeFileSync(jsonPath, JSON.stringify(transfers), "utf-8");
      const scheduledDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      const result = await runWithConditionalSca([
        "request",
        "create-multi-transfer",
        "--note",
        note,
        "--file",
        jsonPath,
        "--scheduled-date",
        scheduledDate,
        "--debit-iban",
        account.iban,
      ]);

      if (result.scaTriggered) {
        console.log(`[request create-multi-transfer SCA probe] SCA triggered; round-trip exercised.`);
        expect(result.stderr).toMatch(SCA_POLL_URL_RE);
      } else {
        console.log(`[request create-multi-transfer SCA probe] NO SCA in OAuth+sandbox.`);
      }
      if (result.exitCode !== 0) {
        throw new Error(
          `request create-multi-transfer exited ${String(result.exitCode)}\n--- stderr ---\n${result.stderr}\n--- stdout ---\n${result.stdout}`,
        );
      }
      const created = JSON.parse(result.stdout) as RequestItem;
      expect(created.id.length).toBeGreaterThan(0);
      expect(created.request_type).toBe("multi_transfer");
    } finally {
      rmSync(jsonDir, { recursive: true, force: true });
    }
  });
});

// NOTE: E2E coverage for the remaining 4 request endpoints is deferred —
// Qonto sandbox returns 403 Forbidden for `request create-flash-card`,
// `request create-virtual-card`, `request approve`, and `request decline`
// (empirical 2026-05-12 probe). All required OAuth scopes are granted on
// the test token (`request_review.write`, `request_cards.write`,
// `request_transfers.write`), so this is a sandbox-plan or admin-role
// limitation — not an auth misconfiguration on our side.
//
// Preconditions documented in the L3 catalog:
//   - precondition: docs/qonto-sandbox-preconditions.md#post-v2-requests-flash-cards
//   - precondition: docs/qonto-sandbox-preconditions.md#post-v2-requests-virtual-cards
//   - precondition: docs/qonto-sandbox-preconditions.md#post-v2-requests-multi-transfers-id-approve
//   - precondition: docs/qonto-sandbox-preconditions.md#post-v2-requests-multi-transfers-id-decline
//
// The CLI and MCP code paths for the deferred endpoints are confirmed
// correct by audit-refresh inspection:
//   - `packages/cli/src/commands/request/{approve,decline,create-flash-card,
//      create-virtual-card}.ts` all wrap with `executeWithCliSca`
//   - `packages/mcp/src/tools/request.ts` wraps all four with
//     `executeWithMcpSca`
//
// Tracked as a follow-up to #555 under #567.
