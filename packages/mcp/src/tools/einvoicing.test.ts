// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

describe("einvoicing MCP tools", () => {
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

  describe("einvoicing_settings", () => {
    it("returns e-invoicing settings from API", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sending_status: "enabled", receiving_status: "enabled" }));

      const result = await mcpClient.callTool({
        name: "einvoicing_settings",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed: unknown = JSON.parse((content[0] as { type: string; text: string }).text);
      expect(parsed).toEqual({ sending_status: "enabled", receiving_status: "enabled" });
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sending_status: "disabled", receiving_status: "disabled" }));

      await mcpClient.callTool({
        name: "einvoicing_settings",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/einvoicing/settings");
    });
  });
});
