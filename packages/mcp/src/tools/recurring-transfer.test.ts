// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

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
          recurring_transfers: [{ id: "rt-1", amount: 100, frequency: "monthly" }],
          meta: { current_page: 1, total_pages: 1, total_count: 1 },
        }),
      );

      const result = await mcpClient.callTool({
        name: "recurring_transfer_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed: unknown = JSON.parse((content[0] as { type: string; text: string }).text);
      expect(parsed).toEqual({
        recurring_transfers: [{ id: "rt-1", amount: 100, frequency: "monthly" }],
        meta: { current_page: 1, total_pages: 1, total_count: 1 },
      });
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfers: [],
          meta: { current_page: 1, total_pages: 0, total_count: 0 },
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
          meta: { current_page: 2, total_pages: 3, total_count: 10 },
        }),
      );

      await mcpClient.callTool({
        name: "recurring_transfer_list",
        arguments: { current_page: 2, per_page: 5 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("5");
    });
  });

  describe("recurring_transfer_show", () => {
    it("returns a single recurring transfer", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfer: { id: "rt-1", amount: 100, frequency: "monthly" },
        }),
      );

      const result = await mcpClient.callTool({
        name: "recurring_transfer_show",
        arguments: { id: "rt-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed: unknown = JSON.parse((content[0] as { type: string; text: string }).text);
      expect(parsed).toEqual({ id: "rt-1", amount: 100, frequency: "monthly" });
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          recurring_transfer: { id: "rt-1", amount: 100, frequency: "monthly" },
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
