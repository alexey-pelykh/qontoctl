// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { registerAccountTools } from "./accounts.js";

function createMockClient() {
  return { get: vi.fn() } as unknown as HttpClient & { get: ReturnType<typeof vi.fn> };
}

describe("registerAccountTools", () => {
  it("registers account_list and account_show tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    registerAccountTools(server, () => Promise.resolve(mockClient));

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(tools).toHaveProperty("account_list");
    expect(tools).toHaveProperty("account_show");
  });

  it("account_list calls GET /v2/bank_accounts", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockResolvedValue({
      bank_accounts: [{ id: "acc-1", name: "Main", balance: 1000 }],
    });
    registerAccountTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["account_list"] as { handler: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.handler({} as never)) as {
      content: { type: string; text: string }[];
    };

    expect(mockClient.get).toHaveBeenCalledWith("/v2/bank_accounts");
    const parsed: unknown = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed).toEqual([{ id: "acc-1", name: "Main", balance: 1000 }]);
  });

  it("account_show calls GET /v2/bank_accounts/{id}", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockResolvedValue({
      bank_account: { id: "acc-1", name: "Main", balance: 1000 },
    });
    registerAccountTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["account_show"] as { handler: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.handler({ id: "acc-1" } as never)) as {
      content: { type: string; text: string }[];
    };

    expect(mockClient.get).toHaveBeenCalledWith("/v2/bank_accounts/acc-1");
    const parsed: unknown = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed).toEqual({ id: "acc-1", name: "Main", balance: 1000 });
  });
});
