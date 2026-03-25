// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

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

function makeRecurringTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: "rt-1",
    initiator_id: "user-1",
    bank_account_id: "acc-1",
    amount: 100,
    amount_cents: 10000,
    amount_currency: "EUR",
    beneficiary_id: "ben-1",
    reference: "Monthly rent",
    note: "",
    first_execution_date: "2026-01-01",
    last_execution_date: null,
    next_execution_date: "2026-02-01",
    frequency: "monthly",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("recurring-transfer MCP tools", () => {
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

  describe("recurring_transfer_list", () => {
    it("returns recurring transfers from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfers: [makeRecurringTransfer()],
          meta: makeMeta(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "recurring_transfer_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        recurring_transfers: { id: string }[];
      };
      expect(parsed.recurring_transfers).toHaveLength(1);
      expect(parsed.recurring_transfers[0]?.id).toBe("rt-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfers: [],
          meta: makeMeta({ total_count: 0 }),
        }),
      );

      await mcpClient.callTool({
        name: "recurring_transfer_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/recurring_transfers");
    });

    it("passes pagination parameters", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfers: [],
          meta: makeMeta({ current_page: 2, total_pages: 3, total_count: 10 }),
        }),
      );

      await mcpClient.callTool({
        name: "recurring_transfer_list",
        arguments: { page: 2, per_page: 5 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("5");
    });
  });

  describe("recurring_transfer_create", () => {
    it("creates a recurring transfer", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfer: makeRecurringTransfer(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: "ben-1",
          bank_account_id: "acc-1",
          amount: 100,
          currency: "EUR",
          reference: "Monthly rent",
          first_execution_date: "2026-01-01",
          frequency: "monthly",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("rt-1");
    });
  });

  describe("recurring_transfer_cancel", () => {
    it("cancels a recurring transfer", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      const result = await mcpClient.callTool({
        name: "recurring_transfer_cancel",
        arguments: { id: "rt-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      expect((content[0] as { type: string; text: string }).text).toContain("rt-1");
    });
  });

  describe("recurring_transfer_show", () => {
    it("returns a single recurring transfer", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfer: makeRecurringTransfer(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "recurring_transfer_show",
        arguments: { id: "rt-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("rt-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfer: makeRecurringTransfer(),
        }),
      );

      await mcpClient.callTool({
        name: "recurring_transfer_show",
        arguments: { id: "rt-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/recurring_transfers/rt-1");
    });
  });
});
