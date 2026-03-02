// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const sampleWebhook = {
  id: "wh-123",
  url: "https://example.com/webhook",
  event_types: ["transaction.created", "transaction.updated"],
  status: "enabled",
  secret: "whsec_abc123",
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
};

describe("webhook MCP tools", () => {
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

  describe("webhook_list", () => {
    it("returns webhook subscriptions from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          webhook_subscriptions: [sampleWebhook],
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
        name: "webhook_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { webhook_subscriptions: unknown[] };
      expect(parsed.webhook_subscriptions).toHaveLength(1);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          webhook_subscriptions: [],
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
        name: "webhook_list",
        arguments: { current_page: 2, per_page: 10 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });
  });

  describe("webhook_show", () => {
    it("returns a single webhook subscription", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: sampleWebhook }));

      const result = await mcpClient.callTool({
        name: "webhook_show",
        arguments: { id: "wh-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; url: string };
      expect(parsed.id).toBe("wh-123");
      expect(parsed.url).toBe("https://example.com/webhook");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: sampleWebhook }));

      await mcpClient.callTool({
        name: "webhook_show",
        arguments: { id: "wh-123" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/webhook_subscriptions/wh-123");
    });
  });

  describe("webhook_create", () => {
    it("creates a webhook and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: sampleWebhook }));

      const result = await mcpClient.callTool({
        name: "webhook_create",
        arguments: {
          url: "https://example.com/webhook",
          event_types: ["transaction.created"],
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("wh-123");
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: sampleWebhook }));

      await mcpClient.callTool({
        name: "webhook_create",
        arguments: {
          url: "https://example.com/webhook",
          event_types: ["transaction.created"],
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/webhook_subscriptions");
      expect(opts.method).toBe("POST");
    });
  });

  describe("webhook_update", () => {
    it("updates a webhook and returns the result", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ webhook_subscription: { ...sampleWebhook, url: "https://example.com/new" } }),
      );

      const result = await mcpClient.callTool({
        name: "webhook_update",
        arguments: {
          id: "wh-123",
          url: "https://example.com/new",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("wh-123");
    });

    it("sends PUT to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ webhook_subscription: sampleWebhook }));

      await mcpClient.callTool({
        name: "webhook_update",
        arguments: {
          id: "wh-123",
          url: "https://example.com/new",
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/webhook_subscriptions/wh-123");
      expect(opts.method).toBe("PUT");
    });
  });

  describe("webhook_delete", () => {
    it("deletes a webhook and returns confirmation", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const result = await mcpClient.callTool({
        name: "webhook_delete",
        arguments: { id: "wh-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { deleted: boolean; id: string };
      expect(parsed.deleted).toBe(true);
      expect(parsed.id).toBe("wh-123");
    });

    it("sends DELETE to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      await mcpClient.callTool({
        name: "webhook_delete",
        arguments: { id: "wh-123" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/webhook_subscriptions/wh-123");
      expect(opts.method).toBe("DELETE");
    });
  });
});
