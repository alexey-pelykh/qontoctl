// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { HttpClient } from "@qontoctl/core";
import { createServer } from "./server.js";

describe("rate limit error handling (integration)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let mcpClient: Client;

  beforeEach(async () => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const httpClient = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
      maxRetries: 0, // No retries — trigger QontoRateLimitError immediately
    });

    const server = createServer({ getClient: () => Promise.resolve(httpClient) });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    mcpClient = new Client({ name: "test", version: "0.0.0" });
    await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns isError with retry-after when API responds with 429", async () => {
    fetchSpy.mockReturnValue(
      Promise.resolve(
        new Response(JSON.stringify({ message: "rate limited" }), {
          status: 429,
          headers: { "Retry-After": "30" },
        }),
      ),
    );

    const result = await mcpClient.callTool({
      name: "org_show",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    const first = content[0] as { type: string; text: string };
    expect(first.text).toContain("Rate limit exceeded");
    expect(first.text).toContain("30 seconds");
  });

  it("returns isError without retry-after when 429 has no Retry-After header", async () => {
    fetchSpy.mockReturnValue(
      Promise.resolve(
        new Response(JSON.stringify({ message: "rate limited" }), {
          status: 429,
        }),
      ),
    );

    const result = await mcpClient.callTool({
      name: "org_show",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    const first = content[0] as { type: string; text: string };
    expect(first.text).toContain("Rate limit exceeded");
    expect(first.text).toContain("Please wait before retrying");
  });
});
