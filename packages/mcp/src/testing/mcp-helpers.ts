// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

let stubConfigPath: string | undefined;

/**
 * Lazily create (once per process) a minimal valid api-key config so the
 * server's per-request `resolve()` (`buildClient(await resolve())`, #663)
 * succeeds deterministically in tests that inject a stub client and set up no
 * config of their own. The stub `buildClient` ignores the resolved config — so
 * its content is irrelevant; this file exists only so `resolveConfig` does not
 * throw `NO_CREDS` (nor, worse, read the developer's real `~/.qontoctl.yaml`).
 */
function getStubConfigPath(): string {
  if (stubConfigPath === undefined) {
    const dir = mkdtempSync(join(tmpdir(), "qontoctl-mcp-stub-config-"));
    stubConfigPath = join(dir, "config.yaml");
    writeFileSync(
      stubConfigPath,
      [
        "api-key:",
        "  organization-slug: test-org",
        "  secret-key: test-secret-key",
        "auth:",
        "  preference: api-key",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
  }
  return stubConfigPath;
}

/**
 * Set up an in-memory MCP client + server pair for integration testing.
 * Stubs global `fetch` with the provided spy.
 *
 * Pass `stagingToken` to construct the underlying HttpClient in sandbox mode,
 * which flips `client.isSandbox` and routes requests through the sandbox host.
 *
 * Pass `resolveOptions` to simulate a server launched with `--profile` /
 * `--config` (umbrella `qontoctl mcp`). It is threaded into `createServer`,
 * which builds the ONE resolver both the data tools and `diagnose` resolve
 * through (#663). The data-tool `buildClient` here is a fixed stub that ignores
 * the resolved config, so `resolveOptions` is observable only via diagnose's
 * report — but both sides now resolve through the same authority.
 *
 * When no `resolveOptions` is given AND no `QONTOCTL_CONFIG_FILE` env is set
 * (CI / isolated unit tests), a memoized stub config path is used so the
 * server's per-request `resolve()` succeeds deterministically. When the caller
 * sets `QONTOCTL_CONFIG_FILE` (the diagnose env-resolution tests), it is left
 * to the resolver's live env read, exactly as the standalone entry behaves.
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

  const envConfigFile = process.env["QONTOCTL_CONFIG_FILE"];
  const effectiveResolveOptions =
    resolveOptions ?? (envConfigFile === undefined || envConfigFile === "" ? { path: getStubConfigPath() } : undefined);

  const server = createServer({
    // Stub data-tool client — ignores the resolved config and returns the fixed
    // HttpClient above. The server still calls resolve() first (#663), which is
    // why effectiveResolveOptions must resolve cleanly.
    buildClient: () => httpClient,
    ...(effectiveResolveOptions !== undefined ? { resolveOptions: effectiveResolveOptions } : {}),
  });
  const mcpClient = await linkInMemory(server);
  return { mcpClient, server, fetchSpy };
}

/**
 * Connect a server built from caller-provided {@link CreateServerOptions} to an
 * in-memory MCP client. Unlike {@link connectInMemory} — which fabricates a stub
 * `buildClient` from a fixed HttpClient and only varies `resolveOptions` — this
 * drives the server from the exact options a real entry point produces, so the
 * SAME `buildClient` + `resolveOptions` feed the one resolver that both the
 * data-tool `getClient` and `diagnose` resolve through. Use it to exercise an
 * entry point's wiring end-to-end (e.g. the standalone `qontoctl-mcp` bootstrap,
 * #661, #663). Fetch stubbing is the caller's responsibility.
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
