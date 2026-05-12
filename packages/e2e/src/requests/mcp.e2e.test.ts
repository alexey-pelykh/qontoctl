// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_PENDING_TOKEN_RE } from "../sca-helpers.js";

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

/**
 * Call an MCP write tool with `wait: false`. If the response is the SCA
 * pending text payload, mock-approve and retry with the captured token;
 * otherwise return the direct (no-SCA) result. Mirrors the helper in
 * `packages/e2e/src/transfers/mcp.e2e.test.ts` (#554) and
 * `packages/e2e/src/beneficiaries/mcp.e2e.test.ts` (#551).
 */
async function callWithConditionalSca(
  client: Client,
  toolName: string,
  baseArgs: Record<string, unknown>,
): Promise<{ readonly result: CallToolResult; readonly scaTriggered: boolean }> {
  const firstResult = (await client.callTool({
    name: toolName,
    arguments: { ...baseArgs, wait: false },
  })) as CallToolResult;
  const firstText = firstTextFromMcpResult(firstResult);

  if (/^SCA required/.test(firstText)) {
    const tokenMatch = firstText.match(SCA_PENDING_TOKEN_RE);
    if (tokenMatch === null || tokenMatch[1] === undefined) {
      throw new Error(`No "Session token: ..." line in SCA-pending response:\n${firstText}`);
    }
    const token = tokenMatch[1];
    expect(token).not.toBe("unknown");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

    const approveResult = (await client.callTool({
      name: "sca_session_mock_decision",
      arguments: { token, decision: "allow" },
    })) as CallToolResult;
    if (approveResult.isError === true) {
      throw new Error(`sca_session_mock_decision failed:\n${JSON.stringify(approveResult, null, 2)}`);
    }

    const retryResult = (await client.callTool({
      name: toolName,
      arguments: { ...baseArgs, sca_session_token: token },
    })) as CallToolResult;
    return { result: retryResult, scaTriggered: true };
  }

  return { result: firstResult, scaTriggered: false };
}

// Empirical capability probe (2026-05-12 against sandbox `0909-future-club-2702`):
// only `request_list` and `request_create_multi_transfer` succeed; the other
// four endpoints return 403 Forbidden despite all relevant OAuth scopes
// being granted. See `packages/e2e/src/requests/cli.e2e.test.ts` header for
// the full table and rationale. Deferral note repeated at the bottom of
// this file for symmetry with the CLI counterpart.

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("request MCP tools (e2e, SCA write paths)", () => {
  pinAuthPreference("oauth-first");

  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv({ authPreference: "oauth-first" }),
      stderr: "pipe",
    });
    client = new Client({ name: "e2e-request-sca", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it("request_create_multi_transfer: create lifecycle (conditional SCA-gating)", async () => {
    // Pull beneficiary/account via MCP tools (mirrors the
    // sca-continuation/mcp.e2e.test.ts setup pattern) so the test stays
    // self-contained.
    const benResult = (await client.callTool({ name: "beneficiary_list", arguments: {} })) as CallToolResult;
    const benList = JSON.parse(firstTextFromMcpResult(benResult)) as { beneficiaries: BeneficiaryListItem[] };
    const beneficiary = benList.beneficiaries[0];
    if (beneficiary === undefined) {
      throw new Error("E2E setup: no beneficiaries in sandbox");
    }

    const accountsResult = (await client.callTool({ name: "account_list", arguments: {} })) as CallToolResult;
    const accounts = JSON.parse(firstTextFromMcpResult(accountsResult)) as BankAccountItem[];
    const account = accounts.find((a) => a.main) ?? accounts[0];
    if (account === undefined) {
      throw new Error("E2E setup: no bank accounts in sandbox");
    }

    const note = `e2e-sca-mcp-mt-${randomUUID().slice(0, 12)}`;
    const scheduledDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

    const { result, scaTriggered } = await callWithConditionalSca(client, "request_create_multi_transfer", {
      note,
      transfers: [
        {
          amount: "1.00",
          currency: "EUR",
          credit_iban: beneficiary.iban,
          credit_account_name: beneficiary.name,
          credit_account_currency: "EUR",
          reference: note,
        },
      ],
      scheduled_date: scheduledDate,
      debit_iban: account.iban,
    });

    if (scaTriggered) {
      console.log(`[request_create_multi_transfer SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[request_create_multi_transfer SCA probe] NO SCA in OAuth+sandbox.`);
    }
    expect(result.isError).not.toBe(true);
    const text = firstTextFromMcpResult(result);
    expect(text).not.toMatch(/^SCA required/);
    const created = JSON.parse(text) as RequestItem;
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.request_type).toBe("multi_transfer");
  });
});

// NOTE: E2E coverage for `request_create_flash_card`, `request_create_virtual_card`,
// `request_approve`, and `request_decline` is deferred — Qonto sandbox
// returns 403 Forbidden on all four (empirical 2026-05-12 probe via both
// CLI and MCP paths). All required OAuth scopes (`request_review.write`,
// `request_cards.write`, `request_transfers.write`) are granted; the
// limitation is sandbox-plan / admin-role level, not auth misconfiguration.
//
// MCP code paths confirmed correct by audit-refresh inspection — all four
// tools wrap with `executeWithMcpSca` in `packages/mcp/src/tools/request.ts`.
// Tracked as a follow-up to #555.
