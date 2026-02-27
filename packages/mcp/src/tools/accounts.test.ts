// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

describe("account MCP tools", () => {
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

  describe("account_list", () => {
    it("returns accounts from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_accounts: [{ id: "acc-1", name: "Main", balance: 1000 }],
        }),
      );

      const result = await mcpClient.callTool({
        name: "account_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed: unknown = JSON.parse(
        (content[0] as { type: string; text: string }).text,
      );
      expect(parsed).toEqual([{ id: "acc-1", name: "Main", balance: 1000 }]);
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ bank_accounts: [] }));

      await mcpClient.callTool({
        name: "account_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/bank_accounts");
    });
  });

  describe("account_show", () => {
    it("returns a single account", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_account: { id: "acc-1", name: "Main", balance: 1000 },
        }),
      );

      const result = await mcpClient.callTool({
        name: "account_show",
        arguments: { id: "acc-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed: unknown = JSON.parse(
        (content[0] as { type: string; text: string }).text,
      );
      expect(parsed).toEqual({ id: "acc-1", name: "Main", balance: 1000 });
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          bank_account: { id: "acc-1", name: "Main", balance: 1000 },
        }),
      );

      await mcpClient.callTool({
        name: "account_show",
        arguments: { id: "acc-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/bank_accounts/acc-1");
    });
  });
});
