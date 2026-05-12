// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TransferListResponseSchema, TransferSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { approveAndRetryMcp, SCA_PENDING_TOKEN_RE, triggerScaMcp } from "../sca-helpers.js";

interface TransferItem {
  readonly id: string;
  readonly beneficiary_id: string;
  readonly amount: number;
  readonly amount_currency: string;
  readonly status: "pending" | "processing" | "canceled" | "declined" | "settled";
  readonly reference: string;
  readonly bank_account_id: string;
}

interface TransferListResponse {
  readonly transfers: TransferItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
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

describe.skipIf(!hasApiKeyCredentials())("transfer MCP tools (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    client = new Client({
      name: "e2e-test-client",
      version: "0.0.0",
    });

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("transfer_list", () => {
    it("lists transfers", async () => {
      const result = await client.callTool({
        name: "transfer_list",
        arguments: {},
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as TransferListResponse;
      TransferListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("transfers");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.transfers)).toBe(true);
    });

    it("lists transfers with pagination", async () => {
      const result = await client.callTool({
        name: "transfer_list",
        arguments: { per_page: 2, page: 1 },
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as TransferListResponse;
      expect(parsed.transfers.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });

    it("filters by status", async () => {
      const result = await client.callTool({
        name: "transfer_list",
        arguments: { status: "settled" },
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as TransferListResponse;
      for (const t of parsed.transfers) {
        expect(t.status).toBe("settled");
      }
    });
  });

  describe("transfer_show", () => {
    it("shows a transfer by ID", async () => {
      const listResult = await client.callTool({
        name: "transfer_list",
        arguments: { per_page: 1 },
      });
      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as TransferListResponse;
      const firstTransfer = listParsed.transfers[0];
      if (firstTransfer === undefined) return;

      const transferId = firstTransfer.id;
      const result = await client.callTool({
        name: "transfer_show",
        arguments: { id: transferId },
      });

      const transfer = JSON.parse(firstTextFromMcpResult(result)) as TransferItem;
      TransferSchema.parse(transfer);
      expect(transfer.id).toBe(transferId);
      expect(transfer).toHaveProperty("amount");
      expect(transfer).toHaveProperty("beneficiary_id");
      expect(transfer).toHaveProperty("status");
      expect(transfer).toHaveProperty("amount_currency");
    });
  });
});

// =============================================================================
// Non-SCA OAuth paths: transfer_verify_payee / transfer_bulk_verify_payee
// =============================================================================
//
// MCP equivalents of the CLI non-SCA paths. These endpoints respond 200
// directly under PSD2 (no 428), so the MCP tools deliberately omit the SCA
// continuation schema — see `packages/mcp/src/tools/transfer.ts`. The
// audit refresh for #458 confirmed this; #449 originally over-flagged them.
//
// `transfer_proof` is intentionally NOT covered in this block — see note
// below the SCA-gated block.

describe.skipIf(!hasOAuthCredentials())("transfer MCP tools (e2e, non-SCA OAuth paths)", () => {
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
    client = new Client({ name: "e2e-transfer-non-sca", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("transfer_verify_payee", () => {
    it("returns proof_token for an existing beneficiary (no SCA challenge)", async () => {
      // Same VoP test as the CLI counterpart — proof-token shape only.
      // The PSD2 dynamic-linking semantic (token binds the SCA token of a
      // subsequent transfer_create per RTS Art. 5) is exercised by
      // `packages/e2e/src/sca-continuation/mcp.e2e.test.ts`.
      const benResult = await client.callTool({
        name: "beneficiary_list",
        arguments: {},
      });
      const benList = JSON.parse(firstTextFromMcpResult(benResult)) as { beneficiaries: BeneficiaryListItem[] };
      const beneficiary = benList.beneficiaries[0];
      if (beneficiary === undefined) {
        throw new Error("E2E setup: no beneficiaries in sandbox");
      }

      const result = await client.callTool({
        name: "transfer_verify_payee",
        arguments: { iban: beneficiary.iban, name: beneficiary.name },
      });
      const vop = JSON.parse(firstTextFromMcpResult(result)) as VopResultLite;
      // VoP proof tokens are pipe-delimited composites
      // (`version|attempt|epoch-ms|base64url-signature`) — see CLI
      // counterpart for the canonical rationale.
      expect(vop.proof_token.token.length).toBeGreaterThan(0);
      expect(vop.proof_token.token).toMatch(/^\S+$/);
      expect(typeof vop.match_result).toBe("string");
    });
  });

  describe("transfer_bulk_verify_payee", () => {
    it("returns proof token and per-entry results for an array batch", async () => {
      const benResult = await client.callTool({
        name: "beneficiary_list",
        arguments: {},
      });
      const benList = JSON.parse(firstTextFromMcpResult(benResult)) as { beneficiaries: BeneficiaryListItem[] };
      const sample = benList.beneficiaries.slice(0, 2);
      if (sample.length === 0) {
        throw new Error("E2E setup: no beneficiaries in sandbox");
      }

      const result = await client.callTool({
        name: "transfer_bulk_verify_payee",
        arguments: {
          entries: sample.map((b) => ({ iban: b.iban, name: b.name })),
        },
      });
      const bulk = JSON.parse(firstTextFromMcpResult(result)) as BulkVopResultsLite;
      expect(bulk.proof_token.token.length).toBeGreaterThan(0);
      expect(bulk.proof_token.token).toMatch(/^\S+$/);
      expect(bulk.requests.length).toBe(sample.length);
    });
  });
});

// =============================================================================
// `transfer_cancel` (with conditional-SCA outcome)
// =============================================================================
//
// Mirrors the CLI block: create a transfer (SCA round-trip #1), then cancel
// it (conditional outcome). The cancel endpoint is empirically NOT SCA-gated
// in Qonto sandbox (2026-05-12 probe), even though `transfer_cancel` wraps
// defensively with `executeWithMcpSca`. The test handles both branches —
// matches sandbox today, will still pass if Qonto starts enforcing SCA on
// cancel later.
//
// `transfer_create` itself is fully covered by
// `packages/e2e/src/sca-continuation/mcp.e2e.test.ts` (three variants:
// wait=false / wait=5 / wait=10); this block targets the cancel path only.
//
// AUDIT AC #4 (#458, originally Notable Finding #2 in #449): REFUTED by
//   - packages/e2e/src/bulk-transfers/cli.e2e.test.ts L71 (sandbox SCA)
//   - packages/e2e/src/recurring-transfers/mcp.e2e.test.ts L102 (sandbox SCA)
//   - packages/e2e/src/recurring-transfers/mcp.e2e.test.ts L168 (sandbox SCA)
// No new probe required.

/**
 * Call an MCP write tool with `wait: false`. If the response is the SCA
 * pending text payload, mock-approve and retry; otherwise return the
 * direct (no-SCA) result. Mirrors `callWithConditionalSca` in
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

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("transfer MCP tools (e2e, SCA write paths)", () => {
  pinAuthPreference("oauth-first");

  let client: Client;
  let transport: StdioClientTransport;
  let beneficiaryId: string;
  let bankAccountId: string;
  let vopProofToken: string;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv({ authPreference: "oauth-first" }),
      stderr: "pipe",
    });
    client = new Client({ name: "e2e-transfer-sca", version: "0.0.0" });
    await client.connect(transport);

    // Pick a non-trusted beneficiary so create actually triggers SCA
    // (PSD2 Art. 13(b) trusted-beneficiary exemption). Pick `main: true`
    // account to avoid `400 insufficient_funds` on post-SCA retry. Both
    // selections follow `sca-continuation/mcp.e2e.test.ts`.
    const benResult = await client.callTool({
      name: "beneficiary_list",
      arguments: {},
    });
    const benList = JSON.parse(firstTextFromMcpResult(benResult)) as { beneficiaries: BeneficiaryListItem[] };
    const beneficiary =
      benList.beneficiaries.find((b) => b.status === "validated" && !b.trusted) ??
      benList.beneficiaries.find((b) => !b.trusted);
    if (beneficiary === undefined) {
      throw new Error(
        "E2E setup: no non-trusted beneficiaries available; need at least one untrusted beneficiary to trigger SCA",
      );
    }
    beneficiaryId = beneficiary.id;

    const accountsResult = await client.callTool({
      name: "account_list",
      arguments: {},
    });
    const accounts = JSON.parse(firstTextFromMcpResult(accountsResult)) as BankAccountItem[];
    const account = accounts.find((a) => a.main) ?? [...accounts].sort((a, b) => b.balance_cents - a.balance_cents)[0];
    if (account === undefined) {
      throw new Error("E2E setup: no bank accounts in sandbox");
    }
    bankAccountId = account.id;

    const vopResult = await client.callTool({
      name: "transfer_verify_payee",
      arguments: { iban: beneficiary.iban, name: beneficiary.name },
    });
    const vop = JSON.parse(firstTextFromMcpResult(vopResult)) as VopResultLite;
    vopProofToken = vop.proof_token.token;
  });

  afterAll(async () => {
    await client.close();
  });

  it("transfer_cancel: create + cancel lifecycle (cancel conditionally SCA-gated)", async () => {
    // Schedule the transfer ~3 days into the future so it stays in
    // `pending` status long enough for the cancel SCA round-trip to land.
    // Without this, the sandbox moves a same-day transfer past `pending`
    // and cancel returns `400 cannot_cancel`. See CLI counterpart for
    // the canonical rationale.
    const scheduledDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

    // ---- Round-trip #1: create the transfer to cancel ------------------
    const reference = `e2e-sca-cancel-${randomUUID().slice(0, 12)}`;
    const createArgs = {
      beneficiary_id: beneficiaryId,
      bank_account_id: bankAccountId,
      reference,
      amount: 1.5,
      scheduled_date: scheduledDate,
      vop_proof_token: vopProofToken,
    };

    const createTrigger = await triggerScaMcp(client, "transfer_create", createArgs);
    expect(createTrigger.scaSessionToken).not.toBe("unknown");
    expect(createTrigger.scaSessionToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(createTrigger.pendingText).toContain("sca_session_show");
    expect(createTrigger.pendingText).toContain("sca_session_token");

    const createRetry = await approveAndRetryMcp(createTrigger, "allow");
    expect(createRetry.isError).not.toBe(true);
    const createText = firstTextFromMcpResult(createRetry);
    expect(createText).not.toMatch(/^SCA required/);
    const transfer = JSON.parse(createText) as { readonly id: string };
    TransferSchema.parse(JSON.parse(createText));
    expect(transfer.id.length).toBeGreaterThan(0);

    // ---- Round-trip #2 (conditional): cancel the transfer --------------
    // The cancel endpoint is empirically NOT SCA-gated in sandbox — the
    // helper handles both paths so the test remains correct if Qonto
    // shifts behavior to start enforcing SCA on cancel.
    const { result: cancelRetry, scaTriggered: cancelScaTriggered } = await callWithConditionalSca(
      client,
      "transfer_cancel",
      { id: transfer.id },
    );

    if (cancelScaTriggered) {
      console.log(`[transfer_cancel SCA probe] SCA triggered in OAuth+sandbox; round-trip exercised.`);
    } else {
      console.log(`[transfer_cancel SCA probe] NO SCA in OAuth+sandbox for transfer_cancel.`);
    }

    expect(cancelRetry.isError).not.toBe(true);
    const cancelText = firstTextFromMcpResult(cancelRetry);
    expect(cancelText).not.toMatch(/^SCA required/);
    const cancelResult = JSON.parse(cancelText) as { readonly canceled?: boolean; readonly id?: string };
    expect(cancelResult.canceled).toBe(true);
    expect(cancelResult.id).toBe(transfer.id);
  });
});

// NOTE: `transfer_proof` E2E coverage is deferred — same blocker as the CLI
// counterpart. Qonto sandbox `0909-future-club-2702` returns `404 not_found`
// from `GET /v2/sepa/transfers/{id}/proof` for ALL settled transfers
// (empirical 2026-05-12 probe of the 10 most-recent). The MCP tool path
// is confirmed correct by code inspection — it delegates to `getTransferProof`
// → `client.getBuffer`, wraps the buffer as a base64-encoded MCP resource,
// and is not SCA-gated. Tracked as a follow-up to #554.
