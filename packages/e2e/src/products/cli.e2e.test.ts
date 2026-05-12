// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { ProductSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliJson } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

interface ProductItem {
  readonly id: string;
  readonly title?: string;
  readonly type?: string;
}

// Per the Qonto auth table, `GET /v2/products` accepts both api-key and OAuth
// (scope: `product.read`). Gate on api-key so the suite runs in CI as well as
// locally. Most sandbox tenants do not have products provisioned — assertions
// degrade gracefully to "list shape only" when the list is empty rather than
// failing on environmental gaps.
describe.skipIf(!hasApiKeyCredentials())("product CLI commands (e2e)", () => {
  describe("product list", () => {
    it("lists products (possibly empty) as JSON", () => {
      const products = cliJson<ProductItem[]>("product", "list");
      expect(Array.isArray(products)).toBe(true);
      const first = products[0];
      if (first !== undefined) {
        ProductSchema.parse(first);
        expect(first).toHaveProperty("id");
      }
    });

    it("supports pagination", () => {
      const products = cliJson<ProductItem[]>("product", "list", "--per-page", "1", "--page", "1");
      expect(Array.isArray(products)).toBe(true);
      expect(products.length).toBeLessThanOrEqual(1);
    });

    it("supports --sort-by", () => {
      const products = cliJson<ProductItem[]>("product", "list", "--sort-by", "created_at:desc", "--per-page", "5");
      expect(Array.isArray(products)).toBe(true);
    });
  });
});
