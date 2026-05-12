// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const sampleProduct = {
  id: "prod-1",
  title: "Espresso",
  type: "good",
  unit_price: { value: "2.50", currency: "EUR" },
  vat_rate: "0.2",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
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

describe("product MCP tools", () => {
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

  describe("product_list", () => {
    it("returns products from the API", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ products: [sampleProduct], meta: meta() }));

      const result = await mcpClient.callTool({ name: "product_list", arguments: {} });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse(content[0]?.text ?? "") as { products: unknown[]; meta: unknown };
      expect(parsed.products).toHaveLength(1);
      expect(parsed.meta).toBeDefined();

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/products");
    });

    it("passes pagination params to the API", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ products: [], meta: meta({ current_page: 2, total_count: 0 }) }));

      await mcpClient.callTool({ name: "product_list", arguments: { page: 2, per_page: 25 } });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("25");
    });

    it("forwards sort_by to the API", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ products: [], meta: meta({ total_count: 0 }) }));

      await mcpClient.callTool({ name: "product_list", arguments: { sort_by: "title:asc" } });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("sort_by")).toBe("title:asc");
    });

    it("rejects per_page above 100 at the MCP boundary", async () => {
      const result = await mcpClient.callTool({
        name: "product_list",
        arguments: { per_page: 500 },
      });

      expect(result.isError).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
