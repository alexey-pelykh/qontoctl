// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { HttpClient } from "@qontoctl/core";
import { createServer } from "../server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface McpTestContext {
  readonly mcpClient: Client;
  readonly server: McpServer;
  readonly fetchSpy: ReturnType<typeof import("vitest").vi.fn>;
}

/**
 * Set up an in-memory MCP client + server pair for integration testing.
 * Stubs global `fetch` with the provided spy.
 *
 * Pass `stagingToken` to construct the underlying HttpClient in sandbox mode,
 * which flips `client.isSandbox` and routes requests through the sandbox host.
 */
export async function connectInMemory(
  fetchSpy: ReturnType<typeof import("vitest").vi.fn>,
  options?: { maxRetries?: number; stagingToken?: string },
): Promise<McpTestContext> {
  const httpClient = new HttpClient({
    baseUrl:
      options?.stagingToken !== undefined
        ? "https://thirdparty-sandbox.staging.qonto.co"
        : "https://thirdparty.qonto.com",
    authorization: "slug:secret",
    ...options,
  });

  const server = createServer({ getClient: () => Promise.resolve(httpClient) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const mcpClient = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);

  return { mcpClient, server, fetchSpy };
}
