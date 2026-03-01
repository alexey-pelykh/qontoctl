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
    total_count: 0,
    per_page: 100,
    ...overrides,
  };
}

describe("transfer MCP tools", () => {
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

  describe("transfer_list", () => {
    it("returns transfers from API", async () => {
      const transfers = [
        {
          id: "txfr-1",
          beneficiary_id: "ben-1",
          amount: 100.5,
          amount_currency: "EUR",
          status: "settled",
          reference: "Invoice 001",
        },
        {
          id: "txfr-2",
          beneficiary_id: "ben-2",
          amount: 200.0,
          amount_currency: "EUR",
          status: "pending",
          reference: "Invoice 002",
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          transfers,
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const result = await mcpClient.callTool({
        name: "transfer_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { transfers: unknown[] };
      expect(parsed.transfers).toHaveLength(2);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          transfers: [],
          meta: makeMeta({ current_page: 2 }),
        }),
      );

      await mcpClient.callTool({
        name: "transfer_list",
        arguments: { current_page: 2, per_page: 10 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });

    it("passes filter params to API", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ transfers: [], meta: makeMeta() }));

      await mcpClient.callTool({
        name: "transfer_list",
        arguments: {
          status: "settled",
          beneficiary_id: "ben-1",
          updated_at_from: "2025-01-01T00:00:00Z",
          sort_by: "updated_at:desc",
        },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("status[]")).toBe("settled");
      expect(url.searchParams.get("beneficiary_ids[]")).toBe("ben-1");
      expect(url.searchParams.get("updated_at_from")).toBe("2025-01-01T00:00:00Z");
      expect(url.searchParams.get("sort_by")).toBe("updated_at:desc");
    });
  });

  describe("transfer_show", () => {
    it("returns a single transfer", async () => {
      const transfer = {
        id: "txfr-123",
        beneficiary_id: "ben-1",
        amount: 100.5,
        amount_currency: "EUR",
        status: "settled",
        reference: "Invoice 001",
      };
      fetchSpy.mockReturnValue(jsonResponse({ transfer }));

      const result = await mcpClient.callTool({
        name: "transfer_show",
        arguments: { id: "txfr-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("txfr-123");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          transfer: { id: "txfr-123", reference: "Test" },
        }),
      );

      await mcpClient.callTool({
        name: "transfer_show",
        arguments: { id: "txfr-123" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/transfers/txfr-123");
    });
  });
});
