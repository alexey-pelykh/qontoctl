// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { listProducts } from "./service.js";

describe("listProducts", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists products without params", async () => {
    const body = {
      products: [
        {
          id: "prod-1",
          title: "Espresso",
          type: "good",
          unit_price: { value: "2.50", currency: "EUR" },
          vat_rate: "0.2",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 100 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listProducts(client);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id).toBe("prod-1");
    expect(result.products[0]?.title).toBe("Espresso");
    expect(result.meta.current_page).toBe(1);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/products");
    expect(url.search).toBe("");
    expect(init.method).toBe("GET");
  });

  it("passes pagination params as query strings", async () => {
    const body = {
      products: [],
      meta: { current_page: 2, next_page: null, prev_page: 1, total_pages: 2, total_count: 30, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listProducts(client, { page: 2, per_page: 25 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("25");
  });

  it("passes sort_by as a query string", async () => {
    const body = {
      products: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 100 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listProducts(client, { sort_by: "created_at:desc" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("sort_by")).toBe("created_at:desc");
  });

  it("omits undefined params", async () => {
    const body = {
      products: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 100 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listProducts(client, { page: 3 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.has("per_page")).toBe(false);
    expect(url.searchParams.has("sort_by")).toBe(false);
  });

  it("returns an empty list when the organization has no products", async () => {
    const body = {
      products: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 100 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listProducts(client);
    expect(result.products).toHaveLength(0);
    expect(result.meta.total_count).toBe(0);
  });

  it("preserves optional fields including links and vat_exemption_code", async () => {
    const body = {
      products: [
        {
          id: "prod-2",
          title: "Consulting hour",
          description: "Hourly rate for consulting",
          internal_note: null,
          type: "service",
          unit_price: { value: "120.00", currency: "EUR" },
          vat_rate: "0.22",
          unit: "hour",
          vat_exemption_code: "N2.1",
          links: [{ title: "Datasheet", url: "https://example.com/datasheet.pdf" }],
          organization_id: "org-1",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
        },
      ],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 100 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listProducts(client);
    const product = result.products[0];
    expect(product?.type).toBe("service");
    expect(product?.unit_price?.value).toBe("120.00");
    expect(product?.unit_price?.currency).toBe("EUR");
    expect(product?.vat_exemption_code).toBe("N2.1");
    expect(product?.unit).toBe("hour");
    expect(product?.links).toEqual([{ title: "Datasheet", url: "https://example.com/datasheet.pdf" }]);
  });
});
