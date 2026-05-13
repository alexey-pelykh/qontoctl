// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BankAccountSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_PENDING_TOKEN_RE } from "../sca-helpers.js";

interface BankAccountItem {
  readonly id: string;
  readonly name: string;
  readonly iban: string;
  readonly status: string;
  readonly currency: string;
}

/**
 * Call an MCP write tool with `wait: false`. If the response is the SCA
 * pending text payload, mock-approve and retry with the captured token;
 * otherwise return the direct (no-SCA) result. Mirrors the helper used in
 * `packages/e2e/src/cards/mcp.e2e.test.ts` (#570) and
 * `packages/e2e/src/beneficiaries/mcp.e2e.test.ts` (#559).
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

// ---------------------------------------------------------------------------
// SCA write paths: bank-account lifecycle (account_create → account_update → account_close)
// ---------------------------------------------------------------------------
//
// Empirical sandbox probe (2026-05-13, sandbox org `0909-future-club-2702`,
// OAuth token with `bank_account.write` scope granted; #563 retry):
//
//   - `account_create` → `POST /v2/bank_accounts`            200 (no SCA)
//       Plan cap is 2 active accounts. The previous probe (#563 / 2026-05-12)
//       failed because the cap was already saturated; closing one of the
//       pre-existing accounts freed a slot, after which create round-trips
//       cleanly without an SCA challenge.
//
//   - `account_update` → `PATCH /v2/bank_accounts/{id}`      200 (no SCA)
//       The PUT-vs-PATCH disambiguation was the load-bearing finding: Qonto
//       returns 404 on `PUT /v2/bank_accounts/{id}` but accepts `PATCH`. Core
//       `updateBankAccount` was changed PUT → PATCH in the same PR.
//
//   - `account_close` → `POST /v2/bank_accounts/{id}/close`  428 sca_required → 200
//       SCA-gated. The MCP `wait: false` shape returns "SCA required" with
//       a session token; the test mock-approves via `sca_session_mock_decision`
//       and retries with `sca_session_token`. Cleanup is self-contained — the
//       test closes the account it created so the plan cap stays at 1 active.
//
// The MCP wrap fix (the load-bearing production change) was delivered in
// #553 (commit `62544cd`) and is unit-test-covered in
// `packages/mcp/src/tools/accounts.test.ts`.
//
// Read-side coverage (`account_list`, `account_show`, `account_iban_certificate`)
// lives in `packages/e2e/src/org-accounts/mcp.e2e.test.ts` — out of scope here.
//
// See #563 for the deferral history (spun off from #553).

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("bank-account MCP tools (e2e, SCA write paths)", () => {
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
    client = new Client({ name: "e2e-bank-account-sca", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it("bank-account lifecycle: account_create → account_update → account_close (conditional SCA-gating)", async () => {
    const runId = randomUUID().slice(0, 8);
    const initialName = `e2e-mcp-${runId}`;
    const renamedName = `e2e-mcp-${runId}-renamed`;

    // ---- Round-trip #1: account_create. Empirically no SCA in sandbox.
    const createOutcome = await callWithConditionalSca(client, "account_create", {
      name: initialName,
    });
    if (createOutcome.scaTriggered) {
      console.log(`[account_create SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[account_create SCA probe] NO SCA in OAuth+sandbox.`);
    }
    expect(createOutcome.result.isError).not.toBe(true);
    const createText = firstTextFromMcpResult(createOutcome.result);
    expect(createText).not.toMatch(/^SCA required/);
    const created = JSON.parse(createText) as BankAccountItem;
    BankAccountSchema.parse(created);
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.name).toBe(initialName);
    expect(created.status).toBe("active");
    const testAccountId = created.id;

    // ---- Round-trip #2: account_update (rename). PATCH semantics under the hood.
    // Empirically no SCA in sandbox.
    const updateOutcome = await callWithConditionalSca(client, "account_update", {
      id: testAccountId,
      name: renamedName,
    });
    if (updateOutcome.scaTriggered) {
      console.log(`[account_update SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[account_update SCA probe] NO SCA in OAuth+sandbox.`);
    }
    expect(updateOutcome.result.isError).not.toBe(true);
    const updated = JSON.parse(firstTextFromMcpResult(updateOutcome.result)) as BankAccountItem;
    expect(updated.id).toBe(testAccountId);
    expect(updated.name).toBe(renamedName);
    expect(updated.status).toBe("active");

    // ---- Round-trip #3: account_close. SCA-gated; helper mock-approves and retries.
    const closeOutcome = await callWithConditionalSca(client, "account_close", {
      id: testAccountId,
    });
    if (closeOutcome.scaTriggered) {
      console.log(`[account_close SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[account_close SCA probe] NO SCA in OAuth+sandbox.`);
    }
    expect(closeOutcome.result.isError).not.toBe(true);
    const closeBody = JSON.parse(firstTextFromMcpResult(closeOutcome.result)) as {
      readonly closed: boolean;
      readonly id: string;
    };
    expect(closeBody.closed).toBe(true);
    expect(closeBody.id).toBe(testAccountId);

    // Defensive post-close verification: the `account_close` tool's success
    // formatter synthesizes `{closed: true, id}` from `formatSuccess` regardless
    // of the actual API response body (`closeBankAccount` returns void). Without
    // this follow-up `account_show`, a flake where the close attempt returned 2xx
    // but the account was not actually closed would pass silently. Re-fetch and
    // assert `status === "closed"` against the live API to catch that class of bug.
    const showResult = (await client.callTool({
      name: "account_show",
      arguments: { id: testAccountId },
    })) as CallToolResult;
    expect(showResult.isError).not.toBe(true);
    const refetched = JSON.parse(firstTextFromMcpResult(showResult)) as BankAccountItem;
    expect(refetched.id).toBe(testAccountId);
    expect(refetched.status).toBe("closed");
  });
});
