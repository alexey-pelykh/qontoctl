// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InternalTransferSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

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

describe.skipIf(!hasApiKeyCredentials())("internal-transfer MCP tools (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  /**
   * Discover internal Qonto-owned bank accounts via `org_show` rather than
   * `account_list`. The latter returns masked IBANs which are rejected by
   * `internal_transfer_create` (`not_found: debit_iban is not found or
   * not active`). The organization endpoint returns real IBANs in
   * `bank_accounts[]` and only includes Qonto-internal accounts.
   */
  async function discoverInternalAccounts(): Promise<readonly OrgBankAccount[]> {
    const result = await client.callTool({ name: "org_show", arguments: {} });
    expect(result.isError).not.toBe(true);
    const text = firstTextFromMcpResult(result);
    const org = JSON.parse(text) as Organization;
    return org.bank_accounts.filter((a) => !a.is_external_account && a.status === "active");
  }

  describe("internal_transfer_create", () => {
    it("rejects create with missing required fields", async () => {
      const result = await client.callTool({
        name: "internal_transfer_create",
        arguments: {},
      });

      expect(result.isError).toBe(true);
    });

    // Empirical SCA observation (2026-05-10, org `0909-future-club-2702`,
    // production api-key endpoint): internal-transfer create succeeds without
    // triggering SCA at amount=1 EUR. #438's probe confirmed the same at
    // amount=1.50, and the prior local probe at amount=0.01 also succeeded.
    // If a future test run starts returning the `executeWithMcpSca`
    // SCA-pending fallback (a structured text response instead of the
    // InternalTransfer JSON), coordinate with #449 Group 6 and adapt this
    // test to the inline mock-decision orchestration pattern used by
    // `bulk-transfers/mcp.e2e.test.ts`.
    //
    // Precondition: the test organization must have ≥2 active internal
    // (Qonto-owned, non-aggregated) bank accounts. See cli.e2e.test.ts for
    // the rationale and provisioning note.
    it("creates an internal transfer between two existing accounts", async () => {
      const accounts = await discoverInternalAccounts();
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
          `[e2e] internal_transfer_create: skipping — requires ≥2 active internal Qonto bank ` +
            `accounts with at least one funded above ${String(TRANSFER_AMOUNT_EUR)} EUR. ` +
            `Found ${String(accounts.length)} internal account(s). Provision a second account ` +
            `via \`qontoctl account create\` (OAuth) and/or fund an existing one.`,
        );
        return;
      }

      const reference = `e2e-mcp-internal-${String(Date.now())}`;

      const result = await client.callTool({
        name: "internal_transfer_create",
        arguments: {
          debit_iban: debit.iban,
          credit_iban: credit.iban,
          reference,
          amount: TRANSFER_AMOUNT_EUR,
          currency: "EUR",
        },
      });

      expect(result.isError).not.toBe(true);

      const text = firstTextFromMcpResult(result);
      // The api-key path returns the InternalTransfer JSON directly. If SCA
      // is required, `executeWithMcpSca` returns a structured pending text
      // (e.g. "SCA required: ..."). We expect the JSON path here.
      const transfer = InternalTransferSchema.parse(JSON.parse(text));
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
