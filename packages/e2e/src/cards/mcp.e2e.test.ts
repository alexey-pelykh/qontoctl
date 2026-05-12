// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CardListResponseSchema, CardSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_PENDING_TOKEN_RE } from "../sca-helpers.js";

interface CardItem {
  readonly id: string;
  readonly status: string;
  readonly card_level: string;
}

interface CardListResponse {
  readonly cards: CardItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

describe.skipIf(!hasOAuthCredentials())("card MCP tools (e2e)", () => {
  pinAuthPreference("oauth-first");

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

  describe("card_list", () => {
    it("returns a list of cards with expected structure", async () => {
      const result = await client.callTool({
        name: "card_list",
        arguments: {},
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as CardListResponse;
      CardListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("cards");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.cards)).toBe(true);
    });

    it("supports pagination", async () => {
      const result = await client.callTool({
        name: "card_list",
        arguments: { per_page: 2, page: 1 },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as CardListResponse;
      expect(parsed.cards.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });

    it("filters by status", async () => {
      const result = await client.callTool({
        name: "card_list",
        arguments: { statuses: ["live"] },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as CardListResponse;
      for (const c of parsed.cards) {
        expect(c.status).toBe("live");
      }
    });
  });

  describe("card_show", () => {
    it("shows a card by ID", async () => {
      const listResult = await client.callTool({
        name: "card_list",
        arguments: { per_page: 1 },
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as CardListResponse;
      const first = listParsed.cards[0];
      if (first === undefined) return;

      const result = await client.callTool({
        name: "card_show",
        arguments: { id: first.id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as CardItem;
      CardSchema.parse(parsed);
      expect(parsed.id).toBe(first.id);
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("card_level");
    });
  });

  describe("card_appearances", () => {
    it("returns available card appearances", async () => {
      const result = await client.callTool({
        name: "card_appearances",
        arguments: {},
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("card_iframe_url", () => {
    it("returns a secure iframe URL for an existing card", async () => {
      // Pick the first non-virtual live card — data_view returns 400 for
      // virtual cards in the sandbox (empirical 2026-05-12). Skip cleanly
      // when no physical card is available; mirrors the CLI counterpart.
      const listResult = await client.callTool({
        name: "card_list",
        arguments: { statuses: ["live"] },
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as CardListResponse;
      const first = listParsed.cards.find(
        (c) =>
          (c as { card_level?: string }).card_level !== "virtual" &&
          (c as { card_level?: string }).card_level !== "virtual_partner",
      );
      if (first === undefined) return;

      const result = await client.callTool({
        name: "card_iframe_url",
        arguments: { id: first.id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as { iframe_url: string };
      expect(parsed).toHaveProperty("iframe_url");
      expect(typeof parsed.iframe_url).toBe("string");
      // The URL must be HTTPS — the iframe carries sensitive PAN/CVV data.
      expect(parsed.iframe_url).toMatch(/^https:\/\//);
    });
  });
});

interface MembershipItem {
  readonly id: string;
}

interface OrgShow {
  readonly slug: string;
  readonly bank_accounts: readonly { readonly id: string; readonly main: boolean }[];
}

interface CreatedCard {
  readonly id: string;
  readonly status: string;
  readonly nickname: string | null;
  readonly atm_option: boolean;
  readonly nfc_option: boolean;
  readonly online_option: boolean;
  readonly foreign_option: boolean;
  readonly atm_monthly_limit: number;
  readonly payment_monthly_limit: number;
  readonly active_days: readonly number[];
  readonly holder_id: string;
  readonly bank_account_id: string;
  readonly card_level: string;
}

/**
 * Call an MCP write tool with `wait: false`. If the response is the SCA
 * pending text payload, mock-approve and retry with the captured token;
 * otherwise return the direct (no-SCA) result. Mirrors the helper in
 * `packages/e2e/src/transfers/mcp.e2e.test.ts` (#554) and
 * `packages/e2e/src/requests/mcp.e2e.test.ts` (#555).
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

// Empirical sandbox probe (2026-05-12, sandbox org `0909-future-club-2702`):
// 5 of 8 covered card write endpoints succeed (create + update-nickname +
// update-limits + lock + unlock). The other 3 (bulk-create, update-options,
// update-restrictions) return 404/403 in the sandbox despite all card.write
// scopes being granted; deferred to a follow-up issue. See
// `packages/e2e/src/cards/cli.e2e.test.ts` header note for the full
// per-endpoint table and idempotency strategy (cards accumulate; 1/run).
// Deferral notes for the destructive trio AND the 3 sandbox-blocked write
// endpoints are repeated at the bottom of this file for symmetry with the
// CLI counterpart.

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("card MCP tools (e2e, SCA write paths)", () => {
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
    client = new Client({ name: "e2e-card-sca", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it("card lifecycle: create → update-{nickname,limits} → lock/unlock (conditional SCA-gating)", async () => {
    // ---- Setup: discover holder/initiator, bank account, and org slug
    // through MCP read tools so the test stays self-contained.
    const memResult = (await client.callTool({ name: "membership_list", arguments: {} })) as CallToolResult;
    const memText = firstTextFromMcpResult(memResult);
    const memList = JSON.parse(memText) as
      | { readonly memberships?: readonly MembershipItem[] }
      | readonly MembershipItem[];
    const members = Array.isArray(memList) ? memList : (memList.memberships ?? []);
    const holder = members[0];
    if (holder === undefined) {
      throw new Error("E2E setup: no memberships in sandbox");
    }
    const holderId = holder.id;

    const orgResult = (await client.callTool({ name: "org_show", arguments: {} })) as CallToolResult;
    const org = JSON.parse(firstTextFromMcpResult(orgResult)) as OrgShow;
    const orgSlug = org.slug;
    const account = org.bank_accounts.find((a) => a.main) ?? org.bank_accounts[0];
    if (account === undefined) {
      throw new Error("E2E setup: no bank accounts in sandbox");
    }

    // ---- Round-trip #1: card_create (SCA-gated, empirically confirmed).
    const createOutcome = await callWithConditionalSca(client, "card_create", {
      holder_id: holderId,
      initiator_id: holderId,
      organization_id: orgSlug,
      bank_account_id: account.id,
      card_level: "virtual",
    });
    if (createOutcome.scaTriggered) {
      console.log(`[card_create SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[card_create SCA probe] NO SCA in OAuth+sandbox.`);
    }
    expect(createOutcome.result.isError).not.toBe(true);
    const createText = firstTextFromMcpResult(createOutcome.result);
    expect(createText).not.toMatch(/^SCA required/);
    const created = JSON.parse(createText) as CreatedCard;
    CardSchema.parse(created);
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.card_level).toBe("virtual");
    const testCardId = created.id;

    // ---- Round-trip #2: card_update_nickname.
    const nickname = `e2e-mcp-${randomUUID().slice(0, 8)}`;
    const nicknameOutcome = await callWithConditionalSca(client, "card_update_nickname", {
      id: testCardId,
      nickname,
    });
    if (nicknameOutcome.scaTriggered) {
      console.log(`[card_update_nickname SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[card_update_nickname SCA probe] NO SCA in OAuth+sandbox.`);
    }
    expect(nicknameOutcome.result.isError).not.toBe(true);
    const nicknameCard = JSON.parse(firstTextFromMcpResult(nicknameOutcome.result)) as CreatedCard;
    expect(nicknameCard.id).toBe(testCardId);
    expect(nicknameCard.nickname).toBe(nickname);

    // ---- Round-trip #3: card_update_limits.
    //
    // Note: virtual cards have a hard `atm_monthly_limit` cap of 20 EUR in
    // the Qonto sandbox — attempting to raise it silently returns the
    // previous value. Exercise `payment_monthly_limit` (no such cap) to
    // assert the wrap lands.
    const limitsOutcome = await callWithConditionalSca(client, "card_update_limits", {
      id: testCardId,
      payment_monthly_limit: 75,
    });
    if (limitsOutcome.scaTriggered) {
      console.log(`[card_update_limits SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[card_update_limits SCA probe] NO SCA in OAuth+sandbox.`);
    }
    expect(limitsOutcome.result.isError).not.toBe(true);
    const limitsCard = JSON.parse(firstTextFromMcpResult(limitsOutcome.result)) as CreatedCard;
    expect(limitsCard.id).toBe(testCardId);
    expect(limitsCard.payment_monthly_limit).toBe(75);

    // ---- Round-trip #4: card_lock.
    const lockOutcome = await callWithConditionalSca(client, "card_lock", { id: testCardId });
    if (lockOutcome.scaTriggered) {
      console.log(`[card_lock SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[card_lock SCA probe] NO SCA in OAuth+sandbox.`);
    }
    expect(lockOutcome.result.isError).not.toBe(true);
    const lockedCard = JSON.parse(firstTextFromMcpResult(lockOutcome.result)) as CreatedCard;
    expect(lockedCard.id).toBe(testCardId);
    expect(lockedCard.status).toBe("paused");

    // ---- Round-trip #5: card_unlock — leaves card in its starting state.
    const unlockOutcome = await callWithConditionalSca(client, "card_unlock", { id: testCardId });
    if (unlockOutcome.scaTriggered) {
      console.log(`[card_unlock SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[card_unlock SCA probe] NO SCA in OAuth+sandbox.`);
    }
    expect(unlockOutcome.result.isError).not.toBe(true);
    const unlockedCard = JSON.parse(firstTextFromMcpResult(unlockOutcome.result)) as CreatedCard;
    expect(unlockedCard.id).toBe(testCardId);
    expect(unlockedCard.status).not.toBe("paused");
  });
});

// ACCEPTED_GAP: `card_report_lost`, `card_report_stolen`, `card_discard`
// E2E coverage is DEFERRED — terminal state, would consume the test card
// per run. The MCP server wraps all three with `executeWithMcpSca`
// (verified by audit-refresh inspection of `packages/mcp/src/tools/card.ts`),
// so the SCA path is structurally identical to the 5 covered endpoints
// above. Exercising the destructive trio would force a 2-card-per-run
// burn rate (1 lifecycle card, 1 sacrificial card per destructive op),
// or 4-card-per-run, with no way to recover a card once `discarded` /
// `lost` / `stolen`. The covered 5 already exercise every SCA-wrapping
// permutation on the working sandbox surface; the destructive endpoints
// add no incremental SCA-shape coverage. Tracked in #458 as the only
// ACCEPTED_GAP cluster for this sub-issue.
//
// NOTE: 3 of 8 covered endpoints are deferred to a follow-up issue
// because Qonto sandbox returns non-200 responses (empirical 2026-05-12):
//
//   - `card_bulk_create`        → `POST /v2/cards/bulk`               404 not_found
//   - `card_update_options`     → `PUT  /v2/cards/{id}/options`       403 Forbidden
//   - `card_update_restrictions`→ `PUT  /v2/cards/{id}/restrictions`  403 Forbidden
//
// Same sandbox-plan / admin-role pattern as the 4 deferred request
// endpoints in #555. All three MCP tools wrap with `executeWithMcpSca`
// (verified by audit-refresh inspection of `packages/mcp/src/tools/card.ts`),
// structurally identical to the 5 covered endpoints above. Tracked as
// a follow-up to #556.
