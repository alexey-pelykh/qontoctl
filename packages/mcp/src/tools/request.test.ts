// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

describe("request MCP tools", () => {
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

  describe("request_list", () => {
    it("returns requests from API", async () => {
      const requests = [
        {
          id: "req-1",
          request_type: "transfer",
          status: "pending",
          initiator_id: "user-1",
          approver_id: null,
          note: "Office supplies",
          declined_note: null,
          processed_at: null,
          created_at: "2026-01-15T10:00:00.000Z",
          creditor_name: "ACME Corp",
          amount: "150.00",
          currency: "EUR",
          scheduled_date: "2026-01-20",
          recurrence: "once",
          last_recurrence_date: null,
          attachment_ids: [],
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          requests,
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 1,
            per_page: 100,
          },
        }),
      );

      const result = await mcpClient.callTool({
        name: "request_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { requests: unknown[] };
      expect(parsed.requests).toHaveLength(1);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          requests: [],
          meta: {
            current_page: 3,
            next_page: null,
            prev_page: 2,
            total_pages: 3,
            total_count: 0,
            per_page: 25,
          },
        }),
      );

      await mcpClient.callTool({
        name: "request_list",
        arguments: { current_page: 3, per_page: 25 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("3");
      expect(url.searchParams.get("per_page")).toBe("25");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          requests: [],
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 0,
            per_page: 100,
          },
        }),
      );

      await mcpClient.callTool({
        name: "request_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/requests");
    });
  });
});
