// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { HttpClient, type ResolveOptions } from "@qontoctl/core";
import { createServer, type CreateServerOptions } from "../server.js";
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
 *
 * Pass `resolveOptions` to simulate a server launched with `--profile` /
 * `--config` (umbrella `qontoctl mcp`). It is threaded into `createServer`
 * so the `diagnose` tool resolves config through the same base the data tools
 * use (#658). The data-tool `getClient` here is a fixed stub, so
 * `resolveOptions` only affects diagnose's own resolution path.
 */
export async function connectInMemory(
  fetchSpy: ReturnType<typeof import("vitest").vi.fn>,
  options?: { maxRetries?: number; stagingToken?: string; resolveOptions?: Pick<ResolveOptions, "path" | "profile"> },
): Promise<McpTestContext> {
  const { resolveOptions, ...httpOptions } = options ?? {};
  const httpClient = new HttpClient({
    baseUrl:
      httpOptions.stagingToken !== undefined
        ? "https://thirdparty-sandbox.staging.qonto.co"
        : "https://thirdparty.qonto.com",
    authorization: "slug:secret",
    ...httpOptions,
  });

  const server = createServer({
    getClient: () => Promise.resolve(httpClient),
    ...(resolveOptions !== undefined ? { resolveOptions } : {}),
  });
  const mcpClient = await linkInMemory(server);
  return { mcpClient, server, fetchSpy };
}

/**
 * Connect a server built from caller-provided {@link CreateServerOptions} to an
 * in-memory MCP client. Unlike {@link connectInMemory} — which fabricates a stub
 * `getClient` from a fetch spy and only lets `resolveOptions` reach `diagnose` —
 * this drives the server from the exact options a real entry point produces, so
 * the SAME options feed both the data-tool `getClient` and the `diagnose`
 * `resolveOptions`. Use it to exercise an entry point's wiring end-to-end (e.g.
 * the standalone `qontoctl-mcp` bootstrap, #661). Fetch stubbing is the caller's
 * responsibility.
 */
export async function connectServerOptionsInMemory(
  options: CreateServerOptions,
): Promise<{ mcpClient: Client; server: McpServer }> {
  const server = createServer(options);
  const mcpClient = await linkInMemory(server);
  return { mcpClient, server };
}

/** Wire an MCP client to a server over a linked in-memory transport pair. */
async function linkInMemory(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);
  return mcpClient;
}
