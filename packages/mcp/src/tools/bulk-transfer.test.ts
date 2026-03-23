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

function makeBulkTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: "bt-1",
    initiator_id: "init-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    total_count: 5,
    completed_count: 3,
    pending_count: 1,
    failed_count: 1,
    results: [],
    ...overrides,
  };
}

describe("bulk-transfer MCP tools", () => {
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

  describe("bulk_transfer_list", () => {
    it("returns bulk transfers from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bulk_transfers: [makeBulkTransfer()],
          meta: makeMeta(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "bulk_transfer_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        bulk_transfers: { id: string }[];
      };
      expect(parsed.bulk_transfers).toHaveLength(1);
      expect(parsed.bulk_transfers[0]?.id).toBe("bt-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bulk_transfers: [],
          meta: makeMeta({ total_count: 0 }),
        }),
      );

      await mcpClient.callTool({
        name: "bulk_transfer_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/bulk_transfers");
    });

    it("passes pagination parameters", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bulk_transfers: [],
          meta: makeMeta({ current_page: 2, total_pages: 3, total_count: 10 }),
        }),
      );

      await mcpClient.callTool({
        name: "bulk_transfer_list",
        arguments: { page: 2, per_page: 5 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("5");
    });
  });

  describe("bulk_transfer_show", () => {
    it("returns a single bulk transfer", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bulk_transfer: makeBulkTransfer(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "bulk_transfer_show",
        arguments: { id: "bt-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("bt-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bulk_transfer: makeBulkTransfer(),
        }),
      );

      await mcpClient.callTool({
        name: "bulk_transfer_show",
        arguments: { id: "bt-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sepa/bulk_transfers/bt-1");
    });
  });
});
