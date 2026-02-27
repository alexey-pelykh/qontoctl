// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { registerStatementTools } from "./statements.js";

function createMockClient() {
  return { get: vi.fn() } as unknown as HttpClient & { get: ReturnType<typeof vi.fn> };
}

describe("registerStatementTools", () => {
  it("registers statement_list and statement_show tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    registerStatementTools(server, () => Promise.resolve(mockClient));

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(tools).toHaveProperty("statement_list");
    expect(tools).toHaveProperty("statement_show");
  });

  it("statement_list calls GET /v2/statements with period params", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockResolvedValue({
      statements: [{ id: "stmt-1", period: "01-2025" }],
      meta: { current_page: 1, total_pages: 1 },
    });
    registerStatementTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["statement_list"] as { handler: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.handler({
      period_from: "01-2025",
      period_to: "12-2025",
    } as never)) as {
      content: { type: string; text: string }[];
    };

    expect(mockClient.get).toHaveBeenCalledWith("/v2/statements", {
      period_from: "01-2025",
      period_to: "12-2025",
    });
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      statements: unknown[];
      meta: unknown;
    };
    expect(parsed.statements).toHaveLength(1);
  });

  it("statement_show calls GET /v2/statements/{id}", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockResolvedValue({
      statement: { id: "stmt-1", period: "01-2025" },
    });
    registerStatementTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["statement_show"] as { handler: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.handler({ id: "stmt-1" } as never)) as {
      content: { type: string; text: string }[];
    };

    expect(mockClient.get).toHaveBeenCalledWith("/v2/statements/stmt-1");
    const parsed: unknown = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed).toEqual({ id: "stmt-1", period: "01-2025" });
  });
});
