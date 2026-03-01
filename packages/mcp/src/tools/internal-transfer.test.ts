// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const sampleInternalTransfer = {
  id: "it-123",
  debit_iban: "FR7630001007941234567890185",
  credit_iban: "FR7630001007949876543210142",
  debit_bank_account_id: "ba-1",
  credit_bank_account_id: "ba-2",
  reference: "Monthly allocation",
  amount: 1000.0,
  amount_cents: 100000,
  currency: "EUR",
  status: "processing",
  created_at: "2026-03-01T10:00:00Z",
};

describe("internal-transfer MCP tools", () => {
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

  describe("internal_transfer_create", () => {
    it("creates an internal transfer and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ internal_transfer: sampleInternalTransfer }));

      const result = await mcpClient.callTool({
        name: "internal_transfer_create",
        arguments: {
          debit_iban: "FR7630001007941234567890185",
          credit_iban: "FR7630001007949876543210142",
          reference: "Monthly allocation",
          amount: 1000.0,
          currency: "EUR",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("it-123");
    });

    it("sends POST to the correct endpoint with body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ internal_transfer: sampleInternalTransfer }));

      await mcpClient.callTool({
        name: "internal_transfer_create",
        arguments: {
          debit_iban: "FR7630001007941234567890185",
          credit_iban: "FR7630001007949876543210142",
          reference: "Monthly allocation",
          amount: 1000.0,
          currency: "EUR",
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/internal_transfers");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        internal_transfer: {
          debit_iban: "FR7630001007941234567890185",
          credit_iban: "FR7630001007949876543210142",
          reference: "Monthly allocation",
          amount: 1000.0,
          currency: "EUR",
        },
      });
    });
  });
});
