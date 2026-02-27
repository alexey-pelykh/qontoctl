// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { registerMembershipTools } from "./memberships.js";

function createMockClient() {
  return { get: vi.fn() } as unknown as HttpClient & { get: ReturnType<typeof vi.fn> };
}

describe("registerMembershipTools", () => {
  it("registers membership_list tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    registerMembershipTools(server, () => Promise.resolve(mockClient));

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(tools).toHaveProperty("membership_list");
  });

  it("membership_list calls GET /v2/memberships", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockResolvedValue({
      memberships: [{ id: "mbr-1", first_name: "John", last_name: "Doe" }],
      meta: { current_page: 1, total_pages: 1 },
    });
    registerMembershipTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["membership_list"] as { handler: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.handler({} as never)) as {
      content: { type: string; text: string }[];
    };

    expect(mockClient.get).toHaveBeenCalledWith("/v2/memberships");
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      memberships: unknown[];
      meta: unknown;
    };
    expect(parsed.memberships).toHaveLength(1);
    expect(parsed.meta).toBeDefined();
  });
});
