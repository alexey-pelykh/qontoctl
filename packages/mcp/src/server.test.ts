// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi } from "vitest";

vi.mock("@qontoctl/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...original,
    resolveConfig: vi.fn(),
    buildApiKeyAuthorization: vi.fn(),
    HttpClient: vi.fn(),
  };
});

import { createServer } from "./server.js";

describe("createServer", () => {
  it("returns an McpServer instance", () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
    expect(typeof server.close).toBe("function");
  });

  it("registers all 10 expected tools", () => {
    const server = createServer();
    // Access internal registered tools via the server's underlying structure
    const registeredTools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    const toolNames = Object.keys(registeredTools);

    expect(toolNames).toContain("org_show");
    expect(toolNames).toContain("account_list");
    expect(toolNames).toContain("account_show");
    expect(toolNames).toContain("transaction_list");
    expect(toolNames).toContain("transaction_show");
    expect(toolNames).toContain("statement_list");
    expect(toolNames).toContain("statement_show");
    expect(toolNames).toContain("label_list");
    expect(toolNames).toContain("label_show");
    expect(toolNames).toContain("membership_list");
    expect(toolNames).toHaveLength(10);
  });

  it("tools have descriptions", () => {
    const server = createServer();
    const registeredTools = (
      server as unknown as {
        _registeredTools: Record<string, { description?: string }>;
      }
    )._registeredTools;

    for (const [name, tool] of Object.entries(registeredTools)) {
      expect(tool.description, `Tool ${name} should have a description`).toBeTruthy();
    }
  });

  it("tool names follow entity_operation underscore convention", () => {
    const server = createServer();
    const registeredTools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    const toolNames = Object.keys(registeredTools);

    const pattern = /^[a-z]+_[a-z]+$/;
    for (const name of toolNames) {
      expect(name, `Tool "${name}" should match {entity}_{operation} pattern`).toMatch(pattern);
    }
  });
});
