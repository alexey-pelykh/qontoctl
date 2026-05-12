// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Monetary amount for a product's unit price.
 *
 * `value` is a decimal string (e.g. `"12.50"`). `currency` is ISO 4217.
 */
export interface ProductUnitPrice {
  readonly value: string;
  readonly currency: string;
}

/**
 * A free-form link attached to a product (e.g. a datasheet URL, an image link).
 */
export interface ProductLink {
  readonly title: string;
  readonly url: string;
}

/**
 * A catalogue product as returned by `GET /v2/products`.
 *
 * Required scope: `product.read`. Currently only the LIST endpoint is exposed
 * by Qonto; CRUD endpoints are documented in the OpenAPI security schemes as
 * `product.write` but the routes are not yet published.
 *
 * All fields beyond `id` are modelled as optional because the Qonto reference
 * documentation does not guarantee their presence on every product (e.g.
 * `vat_exemption_code` is Italian-organization-specific; `internal_note`,
 * `unit`, and `links` are caller-populated and routinely omitted).
 */
export interface Product {
  readonly id: string;
  readonly title?: string | undefined;
  readonly description?: string | null | undefined;
  readonly internal_note?: string | null | undefined;
  readonly type?: string | undefined;
  readonly unit_price?: ProductUnitPrice | undefined;
  readonly vat_rate?: string | undefined;
  readonly unit?: string | null | undefined;
  readonly vat_exemption_code?: string | null | undefined;
  readonly links?: readonly ProductLink[] | undefined;
  readonly organization_id?: string | undefined;
  readonly created_at?: string | undefined;
  readonly updated_at?: string | undefined;
}

/**
 * Parameters accepted by `GET /v2/products`.
 *
 * `sort_by` follows the Qonto convention `field:direction` — e.g.
 * `"title:asc"`, `"created_at:desc"`. Supported fields per the Qonto docs
 * are `created_at` and `title`.
 */
export interface ListProductsParams {
  readonly page?: number;
  readonly per_page?: number;
  readonly sort_by?: string;
}
