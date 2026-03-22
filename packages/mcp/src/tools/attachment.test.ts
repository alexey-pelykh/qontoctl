// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

function makeAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    created_at: "2026-01-15T10:00:00Z",
    file_name: "receipt.pdf",
    file_size: "12345",
    file_content_type: "application/pdf",
    url: "https://example.com/files/receipt.pdf",
    ...overrides,
  };
}

describe("attachment MCP tools", () => {
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

  describe("attachment_show", () => {
    it("returns an attachment by ID", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          attachment: makeAttachment(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "attachment_show",
        arguments: { id: "att-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("att-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          attachment: makeAttachment(),
        }),
      );

      await mcpClient.callTool({
        name: "attachment_show",
        arguments: { id: "att-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/attachments/att-1");
    });
  });

  describe("transaction_attachment_list", () => {
    it("returns attachments for a transaction", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          attachments: [makeAttachment()],
        }),
      );

      const result = await mcpClient.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: "txn-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        attachments: { id: string }[];
      };
      expect(parsed.attachments).toHaveLength(1);
      expect(parsed.attachments[0]?.id).toBe("att-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          attachments: [],
        }),
      );

      await mcpClient.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: "txn-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/transactions/txn-1/attachments");
    });
  });

  describe("transaction_attachment_remove", () => {
    it("removes a specific attachment from a transaction", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

      const result = await mcpClient.callTool({
        name: "transaction_attachment_remove",
        arguments: { transaction_id: "txn-1", attachment_id: "att-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      expect((content[0] as { type: string; text: string }).text).toContain("att-1");
      expect((content[0] as { type: string; text: string }).text).toContain("txn-1");
    });

    it("removes all attachments when no attachment_id provided", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

      const result = await mcpClient.callTool({
        name: "transaction_attachment_remove",
        arguments: { transaction_id: "txn-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      expect((content[0] as { type: string; text: string }).text).toContain("All attachments removed");
    });
  });
});
