// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { InternalTransferSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { CLI_PATH, cli, cliJson, cliRaw } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_POLL_URL_RE } from "../sca-helpers.js";

const execFileAsync = promisify(execFile);

interface OrgBankAccount {
  readonly id: string;
  readonly iban: string;
  readonly status: string;
  readonly is_external_account: boolean;
  readonly balance: number;
}

interface Organization {
  readonly bank_accounts: readonly OrgBankAccount[];
}

/**
 * Discover internal Qonto-owned bank accounts via `org show` rather than
 * `account list`. The list/show endpoints return masked IBANs
 * (`FRXXXXXXXXXXXXXXXXXXXXXXXXX`) which are rejected by `internal_transfers`
 * with `not_found: debit_iban is not found or not active`. The organization
 * endpoint returns real IBANs in `bank_accounts[]` and only includes
 * Qonto-internal accounts (excluding aggregated external bank accounts).
 */
function discoverInternalAccounts(): readonly OrgBankAccount[] {
  const org = cliJson<Organization>("org", "show");
  return org.bank_accounts.filter((a) => !a.is_external_account && a.status === "active");
}

describe.skipIf(!hasApiKeyCredentials())("internal-transfer CLI commands (e2e)", () => {
  describe("internal-transfer create", () => {
    it("rejects create with missing required options", () => {
      try {
        cli("internal-transfer", "create");
        expect.fail("Expected command to exit with non-zero code");
      } catch (error: unknown) {
        const execError = error as { status: number; stderr: Buffer };
        expect(execError.status).not.toBe(0);
      }
    });

    // Empirical SCA observation (2026-05-10, org `0909-future-club-2702`,
    // production api-key endpoint): internal-transfer create succeeds without
    // triggering SCA at amount=1 EUR. #438's probe confirmed the same at
    // amount=1.50, and the prior local probe at amount=0.01 also succeeded.
    // The OAuth+sandbox path is now empirically probed by the
    // `(OAuth+sandbox SCA probe)` describe block below — if a future run
    // flips SCA enforcement on either path, that block surfaces the change
    // explicitly without breaking the api-key happy path here.
    //
    // Precondition: the test organization must have ≥2 active internal
    // (Qonto-owned, non-aggregated) bank accounts. The original test org
    // (`0001-7324`) ships with one (`Compte principal`); the working test
    // org (`0909-future-club-2702`) has two pre-provisioned accounts. Local
    // OAuth `account create` was confirmed to work in principle (returns
    // HTTP 400 plan-limit on `0909-future-club-2702`, HTTP 403 on
    // `0001-7324`); api-key cannot self-provision since `/v2/bank_accounts`
    // POST is OAuth-only. When <2 sufficiently-funded internal accounts are
    // available, the test skips with a console warning so the gap is visible
    // without breaking the suite.
    it("creates an internal transfer between two existing accounts", () => {
      const accounts = discoverInternalAccounts();
      // Pick any active internal account with funds to spare (> 1 EUR) for the
      // debit side; any other active internal account works as credit. We
      // transfer 1 EUR — small enough that even ~250 such transfers would
      // perturb a typical test-org balance by less than 0.1%, large enough
      // to make the > 1 EUR funded threshold unambiguous against rounding /
      // settlement noise. (#463 AC suggested 0.01 EUR or balance assertions;
      // post-transfer balance is async-`processing`, so a synchronous
      // balance assertion is unreliable. The "negligible perturbation" goal
      // is met at 1 EUR against the working test org's funded balance.)
      const TRANSFER_AMOUNT_EUR = 1;
      const debit = accounts.find((a) => a.balance > TRANSFER_AMOUNT_EUR);
      const credit = accounts.find((a) => a.id !== debit?.id);
      if (debit === undefined || credit === undefined) {
        console.warn(
          `[e2e] internal-transfer create: skipping — requires ≥2 active internal Qonto bank ` +
            `accounts with at least one funded above ${String(TRANSFER_AMOUNT_EUR)} EUR. ` +
            `Found ${String(accounts.length)} internal account(s). Provision a second account ` +
            `via \`qontoctl account create\` (OAuth) and/or fund an existing one.`,
        );
        return;
      }

      const reference = `e2e-internal-${String(Date.now())}`;

      const result = cliRaw(
        [
          "--output",
          "json",
          "internal-transfer",
          "create",
          "--debit-iban",
          debit.iban,
          "--credit-iban",
          credit.iban,
          "--reference",
          reference,
          "--amount",
          String(TRANSFER_AMOUNT_EUR),
          "--currency",
          "EUR",
        ],
        { timeout: 30_000 },
      );

      if (!result.ok) {
        throw new Error(
          `internal-transfer create failed: exit=${String(result.status)}\n--- stderr ---\n${result.stderr}\n--- stdout ---\n${result.stdout}`,
        );
      }

      const transfer = InternalTransferSchema.parse(JSON.parse(result.stdout));
      expect(transfer.id.length).toBeGreaterThan(0);
      expect(transfer.slug.length).toBeGreaterThan(0);
      expect(transfer.reference).toBe(reference);
      expect(transfer.amount_currency).toBe("EUR");
      expect(transfer.amount).toBe(TRANSFER_AMOUNT_EUR);
      expect(transfer.amount_cents).toBe(TRANSFER_AMOUNT_EUR * 100);
      expect(transfer.status.length).toBeGreaterThan(0);
      expect(transfer.created_at.length).toBeGreaterThan(0);
    });
  });
});

// OAuth+sandbox SCA probe — local-only (requires OAuth credentials AND a
// staging token, which routes requests to the Qonto sandbox). Sibling to the
// api-key path above; coexists rather than replacing it because the two paths
// historically exhibit different SCA-enforcement (see audit Notable Finding
// #2 in #449, refuted for bulk-transfers/recurring-transfers, still empirically
// unknown for internal-transfer until this probe runs).
//
// The test conditionally exercises either branch of the SCA-trigger decision
// the sandbox makes at request time:
//   - If 428 SCA-required is returned → captures the polling token via the
//     CLI's verbose-log stream, approves through `sca-session mock-decision`,
//     awaits the CLI's retry, asserts the underlying create succeeded.
//   - If the create completes without SCA → asserts no SCA polling URL was
//     logged and the operation still returned a valid InternalTransfer.
// Either outcome is documented via `console.log` so the empirical truth is
// visible in CI / local runs without a flaky pass/fail decision.
describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())(
  "internal-transfer create (OAuth+sandbox SCA probe)",
  () => {
    pinAuthPreference("oauth-first");

    it("triggers SCA round-trip OR completes without SCA in OAuth+sandbox", async () => {
      const accounts = discoverInternalAccounts();
      const TRANSFER_AMOUNT_EUR = 1;
      const debit = accounts.find((a) => a.balance > TRANSFER_AMOUNT_EUR);
      const credit = accounts.find((a) => a.id !== debit?.id);
      if (debit === undefined || credit === undefined) {
        console.warn(
          `[e2e] internal-transfer SCA probe: skipping — requires ≥2 active internal Qonto bank ` +
            `accounts with at least one funded above ${String(TRANSFER_AMOUNT_EUR)} EUR. ` +
            `Found ${String(accounts.length)} internal account(s).`,
        );
        return;
      }

      const reference = `e2e-sca-${randomUUID().slice(0, 12)}`;

      const child = spawn(
        "node",
        [
          CLI_PATH,
          "--verbose",
          "--output",
          "json",
          "internal-transfer",
          "create",
          "--debit-iban",
          debit.iban,
          "--credit-iban",
          credit.iban,
          "--reference",
          reference,
          "--amount",
          String(TRANSFER_AMOUNT_EUR),
          "--currency",
          "EUR",
        ],
        { env: cliEnv(), stdio: ["ignore", "pipe", "pipe"] },
      );

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
      // Wait for the mock-decision subprocess so its result (or rejection)
      // is observable in the test's failure context.
      await approvePromise;

      if (scaToken !== undefined) {
        // SCA-trigger path — the round-trip primitives (#450, #530) are
        // exercised end-to-end. Documenting via console.log so the sandbox's
        // empirical enforcement is visible without driving the test's
        // pass/fail (the assertion is on the final transfer object).
        console.log(
          `[internal-transfer SCA probe] SCA triggered in OAuth+sandbox; round-trip exercised. ` +
            `This diverges from #463's api-key+production observation; sandbox SCA enforcement ` +
            `for internal-transfer is endpoint-inconsistent (see audit Notable Finding #2 in #449).`,
        );
        expect(stderr).toMatch(SCA_POLL_URL_RE);
      } else {
        console.log(
          `[internal-transfer SCA probe] NO SCA in OAuth+sandbox at amount=${String(TRANSFER_AMOUNT_EUR)} EUR ` +
            `(consistent with #463's api-key+production observation at the same amount). ` +
            `The SCA round-trip primitives stay exercised by sca-continuation/ for transfer_create.`,
        );
        expect(stderr).not.toMatch(SCA_POLL_URL_RE);
      }

      if (exit.code !== 0) {
        throw new Error(
          `internal-transfer create exited ${String(exit.code)}\n--- stderr ---\n${stderr}\n--- stdout ---\n${stdout}`,
        );
      }
      const transfer = InternalTransferSchema.parse(JSON.parse(stdout));
      expect(transfer.id.length).toBeGreaterThan(0);
      expect(transfer.slug.length).toBeGreaterThan(0);
      expect(transfer.reference).toBe(reference);
      expect(transfer.amount_currency).toBe("EUR");
      expect(transfer.amount).toBe(TRANSFER_AMOUNT_EUR);
      expect(transfer.amount_cents).toBe(TRANSFER_AMOUNT_EUR * 100);
    });
  },
);
