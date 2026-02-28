// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient, Statement } from "@qontoctl/core";
import { registerStatementTools } from "./statement.js";

type ToolCallback = (args: Record<string, unknown>) => Promise<unknown>;

function makeStatement(overrides: Partial<Statement> = {}): Statement {
  return {
    id: "stmt-1",
    bank_account_id: "acct-1",
    period: "01-2025",
    file: {
      file_name: "statement-01-2025.pdf",
      file_content_type: "application/pdf",
      file_size: "16966",
      file_url: "https://example.com/download/stmt-1.pdf",
    },
    ...overrides,
  };
}

function getTool(
  tools: Map<string, { description: string; cb: ToolCallback }>,
  name: string,
): { description: string; cb: ToolCallback } {
  const tool = tools.get(name);
  if (tool === undefined) {
    throw new Error(`Tool "${name}" not registered`);
  }
  return tool;
}

describe("statement MCP tools", () => {
  let server: McpServer;
  let mockClient: { get: ReturnType<typeof vi.fn> };
  let registeredTools: Map<string, { description: string; cb: ToolCallback }>;

  beforeEach(() => {
    registeredTools = new Map();

    server = {
      registerTool: vi.fn((name: string, config: { description: string; inputSchema?: unknown }, cb: ToolCallback) => {
        registeredTools.set(name, { description: config.description, cb });
      }),
    } as unknown as McpServer;

    mockClient = {
      get: vi.fn(),
    };

    registerStatementTools(server, async () => mockClient as unknown as HttpClient);
  });

  it("registers statement_list and statement_show tools", () => {
    expect(registeredTools.has("statement_list")).toBe(true);
    expect(registeredTools.has("statement_show")).toBe(true);
  });

  describe("statement_list", () => {
    it("calls GET /v2/statements", async () => {
      const statements = [makeStatement()];
      const meta = {
        current_page: 1,
        next_page: null,
        prev_page: null,
        total_pages: 1,
        total_count: 1,
        per_page: 100,
      };
      mockClient.get.mockResolvedValue({ statements, meta });

      const tool = getTool(registeredTools, "statement_list");
      const result = await tool.cb({});

      expect(mockClient.get).toHaveBeenCalledWith("/v2/statements", undefined);
      expect(result).toHaveProperty("content");
    });

    it("passes filter parameters", async () => {
      mockClient.get.mockResolvedValue({
        statements: [],
        meta: {
          current_page: 1,
          next_page: null,
          prev_page: null,
          total_pages: 0,
          total_count: 0,
          per_page: 100,
        },
      });

      const tool = getTool(registeredTools, "statement_list");
      await tool.cb({
        bank_account_id: "acct-1",
        period_from: "01-2025",
        period_to: "06-2025",
        current_page: 2,
        per_page: 50,
      });

      expect(mockClient.get).toHaveBeenCalledWith("/v2/statements", {
        "bank_account_ids[]": "acct-1",
        period_from: "01-2025",
        period_to: "06-2025",
        current_page: "2",
        per_page: "50",
      });
    });
  });

  describe("statement_show", () => {
    it("calls GET /v2/statements/:id", async () => {
      const stmt = makeStatement();
      mockClient.get.mockResolvedValue({ statement: stmt });

      const tool = getTool(registeredTools, "statement_show");
      const result = await tool.cb({ id: "stmt-1" });

      expect(mockClient.get).toHaveBeenCalledWith("/v2/statements/stmt-1");
      expect(result).toHaveProperty("content");
    });

    it("encodes the statement ID", async () => {
      const stmt = makeStatement({ id: "id/with/slashes" });
      mockClient.get.mockResolvedValue({ statement: stmt });

      const tool = getTool(registeredTools, "statement_show");
      await tool.cb({ id: "id/with/slashes" });

      expect(mockClient.get).toHaveBeenCalledWith("/v2/statements/id%2Fwith%2Fslashes");
    });
  });
});
