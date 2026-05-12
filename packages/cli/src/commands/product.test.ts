// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createProductCommand } from "./product.js";
import type { PaginationMeta } from "../pagination.js";

function makeMeta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 0,
    per_page: 100,
    ...overrides,
  };
}

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

describe("product commands", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("product list", () => {
    const sampleProduct = {
      id: "prod-1",
      title: "Espresso",
      type: "good",
      unit_price: { value: "2.50", currency: "EUR" },
      vat_rate: "0.2",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    it("lists products in table format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({ products: [sampleProduct], meta: makeMeta({ total_count: 1 }) }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createProductCommand());
      program.exitOverride();

      await program.parseAsync(["product", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("prod-1");
      expect(output).toContain("Espresso");
      expect(output).toContain("2.50 EUR");
    });

    it("lists products in json format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({ products: [sampleProduct], meta: makeMeta({ total_count: 1 }) }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createProductCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "product", "list"], { from: "user" });

      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual(sampleProduct);
    });

    it("hits /v2/products with pagination params", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ products: [], meta: makeMeta() }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createProductCommand());
      program.exitOverride();

      await program.parseAsync(["--page", "2", "--per-page", "10", "product", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/products");
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });

    it("forwards --sort-by as the sort_by query param", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ products: [], meta: makeMeta() }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createProductCommand());
      program.exitOverride();

      await program.parseAsync(["product", "list", "--sort-by", "created_at:desc"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("sort_by")).toBe("created_at:desc");
    });

    it("renders a row even when optional fields are absent", async () => {
      const minimalProduct = { id: "prod-2" };
      fetchSpy.mockImplementation(() =>
        jsonResponse({ products: [minimalProduct], meta: makeMeta({ total_count: 1 }) }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createProductCommand());
      program.exitOverride();

      await program.parseAsync(["product", "list"], { from: "user" });

      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("prod-2");
    });
  });

  // Silence "expect" coverage for stderrSpy variable (used implicitly via setup).
  it("setup integrity", () => {
    expect(stderrSpy).toBeDefined();
  });
});
