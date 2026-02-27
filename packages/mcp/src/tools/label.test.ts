// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { HttpClient } from "@qontoctl/core";
import { createServer } from "../server.js";

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("label MCP tools", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let mcpClient: Client;

  beforeEach(async () => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const httpClient = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });

    const server = createServer({ getClient: () => Promise.resolve(httpClient) });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    mcpClient = new Client({ name: "test", version: "0.0.0" });
    await Promise.all([
      mcpClient.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("label_list", () => {
    it("returns labels from API", async () => {
      const labels = [
        { id: "abc-123", name: "Marketing", parent_id: null },
        { id: "def-456", name: "Digital", parent_id: "abc-123" },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          labels,
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 2,
            per_page: 100,
          },
        }),
      );

      const result = await mcpClient.callTool({
        name: "label_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { labels: unknown[] };
      expect(parsed.labels).toHaveLength(2);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          labels: [],
          meta: {
            current_page: 2,
            next_page: null,
            prev_page: 1,
            total_pages: 2,
            total_count: 0,
            per_page: 10,
          },
        }),
      );

      await mcpClient.callTool({
        name: "label_list",
        arguments: { page: 2, per_page: 10 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });
  });

  describe("label_show", () => {
    it("returns a single label", async () => {
      const label = {
        id: "abc-123",
        name: "Marketing",
        parent_id: null,
      };
      fetchSpy.mockReturnValue(jsonResponse({ label }));

      const result = await mcpClient.callTool({
        name: "label_show",
        arguments: { id: "abc-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; name: string };
      expect(parsed.id).toBe("abc-123");
      expect(parsed.name).toBe("Marketing");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          label: { id: "abc-123", name: "Test", parent_id: null },
        }),
      );

      await mcpClient.callTool({
        name: "label_show",
        arguments: { id: "abc-123" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/labels/abc-123");
    });
  });
});
