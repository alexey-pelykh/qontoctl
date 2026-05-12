// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ProductListResponseSchema, ProductSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

interface ProductItem {
  readonly id: string;
  readonly title?: string;
}

interface ProductListResponse {
  readonly products: ProductItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

// `/v2/products` accepts api-key and OAuth per the Qonto auth table. Gate on
// api-key so the suite runs in CI as well as locally.
describe.skipIf(!hasApiKeyCredentials())("product MCP tools (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("product_list", () => {
    it("returns a list of products with the expected structure", async () => {
      const result = await client.callTool({ name: "product_list", arguments: {} });
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as ProductListResponse;
      ProductListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("products");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.products)).toBe(true);
      const first = parsed.products[0];
      if (first !== undefined) {
        ProductSchema.parse(first);
      }
    });

    it("supports pagination", async () => {
      const result = await client.callTool({
        name: "product_list",
        arguments: { per_page: 1, page: 1 },
      });
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as ProductListResponse;
      expect(parsed.products.length).toBeLessThanOrEqual(1);
      expect(parsed.meta.current_page).toBe(1);
    });

    it("supports sort_by", async () => {
      const result = await client.callTool({
        name: "product_list",
        arguments: { sort_by: "title:asc", per_page: 5 },
      });
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as ProductListResponse;
      expect(Array.isArray(parsed.products)).toBe(true);
    });
  });
});
