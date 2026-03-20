// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

describe("org MCP tools", () => {
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

  describe("org_show", () => {
    it("returns organization from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          organization: {
            slug: "acme-corp",
            legal_name: "Acme Corp",
            bank_accounts: [],
          },
        }),
      );

      const result = await mcpClient.callTool({
        name: "org_show",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { slug: string };
      expect(parsed.slug).toBe("acme-corp");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          organization: { slug: "acme-corp", legal_name: "Acme Corp", bank_accounts: [] },
        }),
      );

      await mcpClient.callTool({
        name: "org_show",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/organization");
    });
  });
});
