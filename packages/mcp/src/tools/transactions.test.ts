// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { registerTransactionTools } from "./transactions.js";

function createMockClient() {
  return { get: vi.fn() } as unknown as HttpClient & { get: ReturnType<typeof vi.fn> };
}

const ORG_BODY = {
  organization: {
    slug: "test-org",
    legal_name: "Test Org",
    bank_accounts: [{ id: "auto-acc-1", main: true }],
  },
};

describe("registerTransactionTools", () => {
  it("registers transaction_list and transaction_show tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    registerTransactionTools(server, () => Promise.resolve(mockClient));

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(tools).toHaveProperty("transaction_list");
    expect(tools).toHaveProperty("transaction_show");
  });

  it("transaction_list calls GET /v2/transactions with params", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockResolvedValue({
      transactions: [{ id: "txn-1", amount: 42.0, side: "debit" }],
      meta: { current_page: 1, total_pages: 1, total_count: 1 },
    });
    registerTransactionTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["transaction_list"] as { handler: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.handler({
      bank_account_id: "acc-1",
      side: "debit",
    } as never)) as {
      content: { type: string; text: string }[];
    };

    expect(mockClient.get).toHaveBeenCalledWith("/v2/transactions", {
      bank_account_id: "acc-1",
      side: "debit",
    });
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      transactions: unknown[];
      meta: unknown;
    };
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.meta).toBeDefined();
  });

  it("transaction_list passes pagination params as strings", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockImplementation((path: string) => {
      if (path === "/v2/organization") return Promise.resolve(ORG_BODY);
      return Promise.resolve({ transactions: [], meta: {} });
    });
    registerTransactionTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["transaction_list"] as { handler: (...args: unknown[]) => Promise<unknown> };
    await tool.handler({
      current_page: 2,
      per_page: 50,
    } as never);

    expect(mockClient.get).toHaveBeenCalledWith("/v2/transactions", {
      bank_account_id: "auto-acc-1",
      current_page: "2",
      per_page: "50",
    });
  });

  it("transaction_list auto-resolves bank account from organization", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockImplementation((path: string) => {
      if (path === "/v2/organization") return Promise.resolve(ORG_BODY);
      return Promise.resolve({
        transactions: [{ id: "txn-1", amount: 42.0, side: "debit" }],
        meta: { current_page: 1, total_pages: 1, total_count: 1 },
      });
    });
    registerTransactionTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["transaction_list"] as { handler: (...args: unknown[]) => Promise<unknown> };
    await tool.handler({} as never);

    expect(mockClient.get).toHaveBeenCalledWith("/v2/organization");
    expect(mockClient.get).toHaveBeenCalledWith("/v2/transactions", {
      bank_account_id: "auto-acc-1",
    });
  });

  it("transaction_show calls GET /v2/transactions/{id}", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockResolvedValue({
      transaction: { id: "txn-1", amount: 42.0, side: "debit" },
    });
    registerTransactionTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["transaction_show"] as { handler: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.handler({ id: "txn-1" } as never)) as {
      content: { type: string; text: string }[];
    };

    expect(mockClient.get).toHaveBeenCalledWith("/v2/transactions/txn-1");
    const parsed: unknown = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed).toEqual({ id: "txn-1", amount: 42.0, side: "debit" });
  });
});
