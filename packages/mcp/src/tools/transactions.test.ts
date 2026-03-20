// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const ORG_BODY = {
  organization: {
    slug: "test-org",
    legal_name: "Test Org",
    bank_accounts: [
      {
        id: "auto-acc-1",
        name: "Main Account",
        status: "active",
        main: true,
        organization_id: "org-1",
        iban: "FR7630001007941234567890185",
        bic: "BNPAFRPP",
        currency: "EUR",
        balance: 1000,
        balance_cents: 100000,
        authorized_balance: 1000,
        authorized_balance_cents: 100000,
        slug: "test-org-main",
      },
    ],
  },
};

function makeMeta(overrides: Record<string, unknown> = {}) {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 1,
    per_page: 100,
    ...overrides,
  };
}

function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "txn-1",
    transaction_id: "txn-1",
    amount: 42.0,
    amount_cents: 4200,
    settled_balance: null,
    settled_balance_cents: null,
    local_amount: 42.0,
    local_amount_cents: 4200,
    side: "debit",
    operation_type: "card",
    currency: "EUR",
    local_currency: "EUR",
    label: "Payment",
    clean_counterparty_name: "Store",
    settled_at: "2026-01-01T00:00:00Z",
    emitted_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    status: "completed",
    note: null,
    reference: null,
    vat_amount: null,
    vat_amount_cents: null,
    vat_rate: null,
    initiator_id: null,
    label_ids: [],
    attachment_ids: [],
    attachment_lost: false,
    attachment_required: false,
    card_last_digits: null,
    category: "other",
    subject_type: "Card",
    bank_account_id: "acc-1",
    is_external_transaction: false,
    ...overrides,
  };
}

describe("transaction MCP tools", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let mcpClient: Client;

  beforeEach(async () => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    ({ mcpClient } = await connectInMemory(fetchSpy));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("transaction_list", () => {
    it("returns transactions from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          transactions: [makeTransaction()],
          meta: makeMeta(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "transaction_list",
        arguments: { bank_account_id: "acc-1", side: "debit" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        transactions: unknown[];
        meta: unknown;
      };
      expect(parsed.transactions).toHaveLength(1);
      expect(parsed.meta).toBeDefined();
    });

    it("passes filter params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          transactions: [],
          meta: makeMeta({ total_count: 0 }),
        }),
      );

      await mcpClient.callTool({
        name: "transaction_list",
        arguments: { bank_account_id: "acc-1", side: "debit" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/transactions");
      expect(url.searchParams.get("bank_account_id")).toBe("acc-1");
      expect(url.searchParams.get("side")).toBe("debit");
    });

    it("passes pagination params as strings", async () => {
      fetchSpy.mockImplementation((input: URL) => {
        if (input.pathname === "/v2/organization") return jsonResponse(ORG_BODY);
        return jsonResponse({ transactions: [], meta: makeMeta() });
      });

      await mcpClient.callTool({
        name: "transaction_list",
        arguments: { current_page: 2, per_page: 50 },
      });

      const txnCall = fetchSpy.mock.calls.find((c: unknown[]) => (c[0] as URL).pathname === "/v2/transactions") as
        | [URL, RequestInit]
        | undefined;
      expect(txnCall).toBeDefined();
      const txnUrl = (txnCall as [URL, RequestInit])[0];
      expect(txnUrl.searchParams.get("current_page")).toBe("2");
      expect(txnUrl.searchParams.get("per_page")).toBe("50");
    });

    it("auto-resolves bank account from organization", async () => {
      fetchSpy.mockImplementation((input: URL) => {
        if (input.pathname === "/v2/organization") return jsonResponse(ORG_BODY);
        return jsonResponse({
          transactions: [makeTransaction()],
          meta: makeMeta(),
        });
      });

      await mcpClient.callTool({
        name: "transaction_list",
        arguments: {},
      });

      const orgCall = fetchSpy.mock.calls.find((c: unknown[]) => (c[0] as URL).pathname === "/v2/organization");
      expect(orgCall).toBeDefined();

      const txnCall = fetchSpy.mock.calls.find((c: unknown[]) => (c[0] as URL).pathname === "/v2/transactions") as
        | [URL, RequestInit]
        | undefined;
      expect(txnCall).toBeDefined();
      expect((txnCall as [URL, RequestInit])[0].searchParams.get("bank_account_id")).toBe("auto-acc-1");
    });
  });

  describe("transaction_show", () => {
    it("returns a single transaction", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          transaction: makeTransaction(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "transaction_show",
        arguments: { id: "txn-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("txn-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          transaction: makeTransaction(),
        }),
      );

      await mcpClient.callTool({
        name: "transaction_show",
        arguments: { id: "txn-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/transactions/txn-1");
    });
  });
});
