// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const sampleTerminal = {
  id: "term-1",
  poi_id: "POI-001",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const samplePayment = {
  id: "pay-1",
  terminal_id: "term-1",
  amount: { value: "12.50", currency: "EUR" },
  created_at: "2026-02-01T00:00:00Z",
};

function meta(overrides: Partial<{ current_page: number; next_page: number | null; total_count: number }> = {}) {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 1,
    per_page: 100,
    ...overrides,
  };
}

describe("terminal MCP tools", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let mcpClient: Client;

  beforeEach(async () => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    ({ mcpClient } = await connectInMemory(fetchSpy));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("terminal_list", () => {
    it("returns terminals from the API", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ terminals: [sampleTerminal], meta: meta() }));

      const result = await mcpClient.callTool({ name: "terminal_list", arguments: {} });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse(content[0]?.text ?? "") as { terminals: unknown[] };
      expect(parsed.terminals).toHaveLength(1);

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/terminals");
    });

    it("passes pagination params to the API", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ terminals: [], meta: meta({ current_page: 2, total_count: 0 }) }));

      await mcpClient.callTool({ name: "terminal_list", arguments: { page: 2, per_page: 25 } });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("25");
    });
  });

  describe("terminal_payment_create", () => {
    it("posts to /v2/terminals/{id}/payment and returns the unwrapped payment", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ terminal_payment: samplePayment }, { status: 202 }));

      const result = await mcpClient.callTool({
        name: "terminal_payment_create",
        arguments: { terminal_id: "term-1", amount: "12.50" },
      });

      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(content[0]?.text ?? "") as Record<string, unknown>;
      expect(parsed).toEqual(samplePayment);

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/terminals/term-1/payment");
      expect(init.method).toBe("POST");

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({ amount: { value: "12.50", currency: "EUR" } });
    });

    it("normalizes integer and single-decimal amounts to X.YY", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ terminal_payment: samplePayment }, { status: 202 }));

      await mcpClient.callTool({
        name: "terminal_payment_create",
        arguments: { terminal_id: "term-1", amount: "5" },
      });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(init.body as string) as { amount: { value: string } };
      expect(body.amount.value).toBe("5.00");
    });

    it("forwards metadata through to the API", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ terminal_payment: samplePayment }, { status: 202 }));

      await mcpClient.callTool({
        name: "terminal_payment_create",
        arguments: {
          terminal_id: "term-1",
          amount: "12.50",
          metadata: { order_id: "ord-42", table: 7 },
        },
      });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(init.body as string) as { metadata?: Record<string, unknown> };
      expect(body.metadata).toEqual({ order_id: "ord-42", table: 7 });
    });

    it("returns an error result when amount is below 0.10", async () => {
      const result = await mcpClient.callTool({
        name: "terminal_payment_create",
        arguments: { terminal_id: "term-1", amount: "0.05" },
      });

      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect(content[0]?.text).toMatch(/between 0\.10 and 100000\.00/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns an error result when amount has more than 2 decimal places", async () => {
      const result = await mcpClient.callTool({
        name: "terminal_payment_create",
        arguments: { terminal_id: "term-1", amount: "12.345" },
      });

      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect(content[0]?.text).toMatch(/decimal string/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("auto-generates an idempotency key", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ terminal_payment: samplePayment }, { status: 202 }));

      await mcpClient.callTool({
        name: "terminal_payment_create",
        arguments: { terminal_id: "term-1", amount: "12.50" },
      });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });
});
