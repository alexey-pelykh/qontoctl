// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { Quote, QuoteAddress, QuoteAmount, QuoteClient, QuoteDiscount, QuoteItem } from "./quote.js";

export const QuoteAmountSchema = z
  .object({
    value: z.string(),
    currency: z.string(),
  })
  .strip() satisfies z.ZodType<QuoteAmount>;

// Qonto's quote-endpoint docs declare `discount.type` as `[percentage, amount]`,
// but the live `/v2/quotes` API returns `"absolute"` for fixed-amount discounts
// (reported in #496 with raw curl evidence, 2026-05-17). The client-invoice
// endpoint docs use `"absolute"` canonically for the same semantic. Accept all
// three values to remain forward-compatible regardless of which docs are right.
export const QuoteDiscountSchema = z
  .object({
    type: z.enum(["percentage", "absolute", "amount"]),
    value: z.string(),
    amount: QuoteAmountSchema,
    amount_cents: z.number(),
  })
  .strip() satisfies z.ZodType<QuoteDiscount>;

// Per Qonto's quote-endpoint docs, the nested Item schema has no `required:`
// list — every field MAY be omitted entirely. Relaxed `.nullable()` fields to
// `.nullable().optional()` (R-SS-1 / #604 pattern); strict fields kept as-is
// (out of nullable-vs-optional audit scope, separate strict-to-optional class).
export const QuoteItemSchema = z
  .object({
    title: z.string(),
    description: z.string().nullable().optional(),
    quantity: z.string(),
    unit: z.string().nullable().optional().default(null),
    vat_rate: z.string(),
    vat_exemption_reason: z.string().nullable().optional().default(null),
    unit_price: QuoteAmountSchema,
    unit_price_cents: z.number(),
    total_amount: QuoteAmountSchema,
    total_amount_cents: z.number(),
    total_vat: QuoteAmountSchema,
    total_vat_cents: z.number(),
    subtotal: QuoteAmountSchema,
    subtotal_cents: z.number(),
    discount: QuoteDiscountSchema.nullable().optional().default(null),
  })
  .strip() satisfies z.ZodType<QuoteItem>;

// Per Qonto's quote-endpoint docs, the nested Address schema has no
// `required:` list — every field MAY be omitted entirely. Relaxed to
// `.nullable().optional()` (R-SS-1 / #604 pattern).
export const QuoteAddressSchema = z
  .object({
    street_address: z.string().nullable().optional().default(null),
    city: z.string().nullable().optional().default(null),
    zip_code: z.string().nullable().optional().default(null),
    province_code: z.string().nullable().optional().default(null),
    country_code: z.string().nullable().optional().default(null),
  })
  .strip() satisfies z.ZodType<QuoteAddress>;

// Per Qonto's quote-endpoint docs, the EmbeddedClient schema has no
// `required:` list — every field other than `id` and `type` MAY be omitted
// entirely. Relaxed to `.nullable().optional()` (R-SS-1 / #604 pattern).
// `id` and `type` are kept strict because they are universally returned
// and `type` drives downstream branching (individual/company/freelancer).
export const QuoteClientSchema = z
  .object({
    id: z.string(),
    type: z.enum(["individual", "company", "freelancer"]),
    name: z.string().nullable().optional().default(null),
    first_name: z.string().nullable().optional().default(null),
    last_name: z.string().nullable().optional().default(null),
    email: z.string().nullable().optional().default(null),
    vat_number: z.string().nullable().optional().default(null),
    tax_identification_number: z.string().nullable().optional().default(null),
    address: z.string().nullable().optional().default(null),
    city: z.string().nullable().optional().default(null),
    zip_code: z.string().nullable().optional().default(null),
    province_code: z.string().nullable().optional().default(null),
    country_code: z.string().nullable().optional().default(null),
    recipient_code: z.string().nullable().optional().default(null),
    locale: z.string().nullable().optional().default(null),
    billing_address: QuoteAddressSchema.nullable().optional().default(null),
    delivery_address: QuoteAddressSchema.nullable().optional().default(null),
  })
  .strip() satisfies z.ZodType<QuoteClient>;

// Per Qonto's quote-endpoint docs (list / retrieve / create / patch),
// `Quote.required` covers: id, organization_id, number, status, currency,
// total_amount{,_cents}, vat_amount{,_cents}, issue_date, expiry_date,
// created_at, items, client, organization. Every other field MAY be
// omitted entirely. Relaxed each non-required `.nullable()` field to
// `.nullable().optional()` (#601, mirroring #604's L2 audit pattern).
export const QuoteSchema = z
  .object({
    id: z.string(),
    organization_id: z.string(),
    number: z.string(),
    status: z.enum(["pending_approval", "approved", "canceled"]),
    currency: z.string(),
    total_amount: QuoteAmountSchema,
    total_amount_cents: z.number(),
    vat_amount: QuoteAmountSchema,
    vat_amount_cents: z.number(),
    issue_date: z.string(),
    expiry_date: z.string(),
    created_at: z.string(),
    approved_at: z.string().nullable().optional(),
    canceled_at: z.string().nullable().optional(),
    attachment_id: z.string().nullable().optional(),
    quote_url: z.string().nullable().optional(),
    contact_email: z.string().nullable().optional(),
    terms_and_conditions: z.string().nullable().optional(),
    header: z.string().nullable().optional(),
    footer: z.string().nullable().optional(),
    discount: QuoteDiscountSchema.nullable().optional().default(null),
    items: z.array(QuoteItemSchema).readonly(),
    client: QuoteClientSchema,
    invoice_ids: z.array(z.string()).readonly().optional(),
  })
  .strip() satisfies z.ZodType<Quote>;

export const QuoteResponseSchema = z
  .object({
    quote: QuoteSchema,
  })
  .strip();

export const QuoteListResponseSchema = z
  .object({
    quotes: z.array(QuoteSchema),
    meta: PaginationMetaSchema,
  })
  .strip();
