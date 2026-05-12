// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";

/**
 * Schema for a product's unit price as returned under
 * `Product.unit_price`. `value` is a decimal string per Qonto convention
 * (the API rejects floating-point JSON numbers for monetary fields); the
 * schema does not enforce that — the value is server-trusted echo-back.
 */
export const ProductUnitPriceSchema = z
  .object({
    value: z.string(),
    currency: z.string(),
  })
  .strip();

/**
 * Schema for a single link attached to a product.
 */
export const ProductLinkSchema = z
  .object({
    title: z.string(),
    url: z.string(),
  })
  .strip();

/**
 * Schema for a Qonto product as returned by `GET /v2/products`.
 *
 * Only `id` is required. Every other field is optional because the API
 * documentation does not guarantee their presence on every product, and the
 * shape varies by organization (e.g. `vat_exemption_code` is only populated
 * for Italian organizations). `description`, `internal_note`, `unit`, and
 * `vat_exemption_code` are explicitly `.nullable()` because the API echoes
 * back `null` when the caller cleared them.
 */
export const ProductSchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    internal_note: z.string().nullable().optional(),
    type: z.string().optional(),
    unit_price: ProductUnitPriceSchema.optional(),
    vat_rate: z.string().optional(),
    unit: z.string().nullable().optional(),
    vat_exemption_code: z.string().nullable().optional(),
    links: z.array(ProductLinkSchema).optional(),
    organization_id: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .strip();

/**
 * Schema for the `GET /v2/products` list response.
 */
export const ProductListResponseSchema = z
  .object({
    products: z.array(ProductSchema),
    meta: PaginationMetaSchema,
  })
  .strip();
