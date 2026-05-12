// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { InternalTransferSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_PENDING_TOKEN_RE } from "../sca-helpers.js";

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
    // The OAuth+sandbox path is now empirically probed by the
    // `(OAuth+sandbox SCA probe)` describe block below — if a future run
    // flips SCA enforcement on either path, that block surfaces the change
    // explicitly without breaking the api-key happy path here.
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

// OAuth+sandbox SCA probe — local-only (requires OAuth credentials AND a
// staging token). Conditionally exercises the SCA round-trip via two-step
// orchestration:
//   - call `internal_transfer_create` with `wait: false`
//   - if response is "SCA required" → mock-approve via `sca_session_mock_decision`,
//     retry with `sca_session_token` set
//   - if response is the InternalTransfer JSON directly → SCA was not required;
//     assert that and document the observation
// Documents the empirical truth via console.log; the pass/fail decision is on
// the final InternalTransfer object.
describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())(
  "internal_transfer_create (OAuth+sandbox SCA probe)",
  () => {
    pinAuthPreference("oauth-first");

    let probeClient: Client;
    let probeTransport: StdioClientTransport;

    beforeAll(async () => {
      probeTransport = new StdioClientTransport({
        command: "node",
        args: [CLI_PATH, "mcp"],
        env: cliEnv(),
        stderr: "pipe",
      });
      probeClient = new Client({ name: "e2e-internal-sca-probe", version: "0.0.0" });
      await probeClient.connect(probeTransport);
    });

    afterAll(async () => {
      await probeClient.close();
    });

    // Local mirror of the api-key describe's helper; bound to `probeClient`
    // (different MCP transport/scope than the outer block's `client`).
    async function discoverInternalAccountsViaProbe(): Promise<readonly OrgBankAccount[]> {
      const result = await probeClient.callTool({ name: "org_show", arguments: {} });
      expect(result.isError).not.toBe(true);
      const text = firstTextFromMcpResult(result);
      const org = JSON.parse(text) as Organization;
      return org.bank_accounts.filter((a) => !a.is_external_account && a.status === "active");
    }

    it("triggers SCA round-trip OR returns transfer directly in OAuth+sandbox", async () => {
      const accounts = await discoverInternalAccountsViaProbe();
      const TRANSFER_AMOUNT_EUR = 1;
      const debit = accounts.find((a) => a.balance > TRANSFER_AMOUNT_EUR);
      const credit = accounts.find((a) => a.id !== debit?.id);
      if (debit === undefined || credit === undefined) {
        console.warn(
          `[e2e] internal_transfer_create SCA probe: skipping — requires ≥2 active internal Qonto bank ` +
            `accounts with at least one funded above ${String(TRANSFER_AMOUNT_EUR)} EUR. ` +
            `Found ${String(accounts.length)} internal account(s).`,
        );
        return;
      }

      const reference = `e2e-sca-mcp-${randomUUID().slice(0, 12)}`;
      const baseArgs = {
        debit_iban: debit.iban,
        credit_iban: credit.iban,
        reference,
        amount: TRANSFER_AMOUNT_EUR,
        currency: "EUR",
      };

      // wait: false → server returns SCA-pending immediately on 428, no inline
      // polling. This is the canonical two-step pattern, mirroring
      // `sca-continuation/mcp.e2e.test.ts:235`. PSD2 dynamic-linking requires
      // the retry call to use identical args plus the captured token.
      const firstResult = (await probeClient.callTool({
        name: "internal_transfer_create",
        arguments: { ...baseArgs, wait: false },
      })) as CallToolResult;
      const firstText = firstTextFromMcpResult(firstResult);

      if (/^SCA required/.test(firstText)) {
        // SCA-trigger path — exercise the round-trip.
        console.log(
          `[internal_transfer_create SCA probe] SCA triggered in OAuth+sandbox; round-trip exercised. ` +
            `This diverges from #463's api-key+production observation; sandbox SCA enforcement ` +
            `for internal-transfer is endpoint-inconsistent (see audit Notable Finding #2 in #449).`,
        );
        const tokenMatch = firstText.match(SCA_PENDING_TOKEN_RE);
        if (tokenMatch === null || tokenMatch[1] === undefined) {
          throw new Error(`No "Session token: ..." line in SCA-pending response:\n${firstText}`);
        }
        const token = tokenMatch[1];
        expect(token).not.toBe("unknown");
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

        const approveResult = (await probeClient.callTool({
          name: "sca_session_mock_decision",
          arguments: { token, decision: "allow" },
        })) as CallToolResult;
        if (approveResult.isError === true) {
          throw new Error(`sca_session_mock_decision failed:\n${JSON.stringify(approveResult, null, 2)}`);
        }

        const retryResult = (await probeClient.callTool({
          name: "internal_transfer_create",
          arguments: { ...baseArgs, sca_session_token: token },
        })) as CallToolResult;
        expect(retryResult.isError).not.toBe(true);
        const retryText = firstTextFromMcpResult(retryResult);
        expect(retryText).not.toMatch(/^SCA required/);
        const transfer = InternalTransferSchema.parse(JSON.parse(retryText));
        expect(transfer.id.length).toBeGreaterThan(0);
        expect(transfer.reference).toBe(reference);
        expect(transfer.amount).toBe(TRANSFER_AMOUNT_EUR);
        expect(transfer.amount_currency).toBe("EUR");
        expect(transfer.amount_cents).toBe(TRANSFER_AMOUNT_EUR * 100);
      } else {
        // No-SCA path — the first call returned the transfer directly.
        console.log(
          `[internal_transfer_create SCA probe] NO SCA in OAuth+sandbox at amount=${String(TRANSFER_AMOUNT_EUR)} EUR ` +
            `(consistent with #463's api-key+production observation at the same amount). ` +
            `The SCA round-trip primitives stay exercised by sca-continuation/ for transfer_create.`,
        );
        expect(firstResult.isError).not.toBe(true);
        const transfer = InternalTransferSchema.parse(JSON.parse(firstText));
        expect(transfer.id.length).toBeGreaterThan(0);
        expect(transfer.reference).toBe(reference);
        expect(transfer.amount).toBe(TRANSFER_AMOUNT_EUR);
        expect(transfer.amount_currency).toBe("EUR");
        expect(transfer.amount_cents).toBe(TRANSFER_AMOUNT_EUR * 100);
      }
    });
  },
);
