// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { InternalTransferSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli, cliJson, cliRaw } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

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
    // If a future test run starts failing with HTTP 428 / `sca_required`,
    // the org's SCA enforcement may have changed — coordinate with #449
    // Group 6 (SCA-gated paths) and migrate this exercise to the
    // SCA-orchestrated pattern used by `bulk-transfers/` and
    // `recurring-transfers/`.
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
