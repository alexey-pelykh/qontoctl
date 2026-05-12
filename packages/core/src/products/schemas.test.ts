// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import { ProductLinkSchema, ProductListResponseSchema, ProductSchema, ProductUnitPriceSchema } from "./schemas.js";

describe("ProductUnitPriceSchema", () => {
  it("accepts a decimal-string value and any ISO currency", () => {
    const result = ProductUnitPriceSchema.parse({ value: "12.50", currency: "EUR" });
    expect(result.value).toBe("12.50");
    expect(result.currency).toBe("EUR");
  });

  it("rejects numeric values (must be decimal string per Qonto convention)", () => {
    expect(() => ProductUnitPriceSchema.parse({ value: 12.5, currency: "EUR" })).toThrow();
  });

  it("rejects when currency is missing", () => {
    expect(() => ProductUnitPriceSchema.parse({ value: "12.50" })).toThrow();
  });
});

describe("ProductLinkSchema", () => {
  it("parses a link object", () => {
    const result = ProductLinkSchema.parse({ title: "Datasheet", url: "https://example.com/d.pdf" });
    expect(result.title).toBe("Datasheet");
    expect(result.url).toBe("https://example.com/d.pdf");
  });
});

describe("ProductSchema", () => {
  it("accepts a minimal product with only id", () => {
    const result = ProductSchema.parse({ id: "prod-1" });
    expect(result.id).toBe("prod-1");
    expect(result.title).toBeUndefined();
  });

  it("accepts a full product object", () => {
    const result = ProductSchema.parse({
      id: "prod-1",
      title: "Espresso",
      description: "A double shot of espresso",
      internal_note: "Sourced from supplier X",
      type: "good",
      unit_price: { value: "2.50", currency: "EUR" },
      vat_rate: "0.2",
      unit: "cup",
      vat_exemption_code: null,
      links: [{ title: "Image", url: "https://example.com/espresso.jpg" }],
      organization_id: "org-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(result.title).toBe("Espresso");
    expect(result.unit_price?.value).toBe("2.50");
    expect(result.vat_exemption_code).toBeNull();
    expect(result.links).toHaveLength(1);
  });

  it("accepts nullable description, internal_note, unit, vat_exemption_code", () => {
    const result = ProductSchema.parse({
      id: "prod-1",
      description: null,
      internal_note: null,
      unit: null,
      vat_exemption_code: null,
    });
    expect(result.description).toBeNull();
    expect(result.internal_note).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.vat_exemption_code).toBeNull();
  });

  it("strips unknown fields", () => {
    const result = ProductSchema.parse({
      id: "prod-1",
      title: "Espresso",
      // Forward-compat: API might add fields. `.strip()` discards them.
      extra: "ignored",
    });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects when id is missing", () => {
    expect(() =>
      ProductSchema.parse({
        title: "Espresso",
      }),
    ).toThrow();
  });
});

describe("ProductListResponseSchema", () => {
  it("parses an empty list", () => {
    const result = ProductListResponseSchema.parse({
      products: [],
      meta: {
        current_page: 1,
        next_page: null,
        prev_page: null,
        total_pages: 1,
        total_count: 0,
        per_page: 100,
      },
    });
    expect(result.products).toEqual([]);
    expect(result.meta.total_count).toBe(0);
  });

  it("parses a populated list", () => {
    const result = ProductListResponseSchema.parse({
      products: [
        {
          id: "prod-1",
          title: "Espresso",
          type: "good",
        },
      ],
      meta: {
        current_page: 1,
        next_page: null,
        prev_page: null,
        total_pages: 1,
        total_count: 1,
        per_page: 100,
      },
    });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.title).toBe("Espresso");
  });
});
