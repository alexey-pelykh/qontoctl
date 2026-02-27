// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { registerLabelTools } from "./labels.js";

function createMockClient() {
  return { get: vi.fn() } as unknown as HttpClient & { get: ReturnType<typeof vi.fn> };
}

describe("registerLabelTools", () => {
  it("registers label_list and label_show tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    registerLabelTools(server, () => Promise.resolve(mockClient));

    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(tools).toHaveProperty("label_list");
    expect(tools).toHaveProperty("label_show");
  });

  it("label_list calls GET /v2/labels", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockResolvedValue({
      labels: [{ id: "lbl-1", name: "Marketing" }],
    });
    registerLabelTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["label_list"] as { handler: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.handler({} as never)) as {
      content: { type: string; text: string }[];
    };

    expect(mockClient.get).toHaveBeenCalledWith("/v2/labels");
    const parsed: unknown = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed).toEqual([{ id: "lbl-1", name: "Marketing" }]);
  });

  it("label_show calls GET /v2/labels/{id}", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    const mockClient = createMockClient();
    mockClient.get.mockResolvedValue({
      label: { id: "lbl-1", name: "Marketing", parent_id: null },
    });
    registerLabelTools(server, () => Promise.resolve(mockClient));

    const tool = (
      server as unknown as {
        _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
      }
    )._registeredTools["label_show"] as { handler: (...args: unknown[]) => Promise<unknown> };
    const result = (await tool.handler({ id: "lbl-1" } as never)) as {
      content: { type: string; text: string }[];
    };

    expect(mockClient.get).toHaveBeenCalledWith("/v2/labels/lbl-1");
    const parsed: unknown = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed).toEqual({ id: "lbl-1", name: "Marketing", parent_id: null });
  });
});
