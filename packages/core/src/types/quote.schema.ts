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

export const QuoteDiscountSchema = z
  .object({
    type: z.enum(["percentage", "amount"]),
    value: z.string(),
    amount: QuoteAmountSchema,
    amount_cents: z.number(),
  })
  .strip() satisfies z.ZodType<QuoteDiscount>;

export const QuoteItemSchema = z
  .object({
    title: z.string(),
    description: z.string().nullable(),
    quantity: z.string(),
    unit: z.string().nullable().default(null),
    vat_rate: z.string(),
    vat_exemption_reason: z.string().nullable().default(null),
    unit_price: QuoteAmountSchema,
    unit_price_cents: z.number(),
    total_amount: QuoteAmountSchema,
    total_amount_cents: z.number(),
    total_vat: QuoteAmountSchema,
    total_vat_cents: z.number(),
    subtotal: QuoteAmountSchema,
    subtotal_cents: z.number(),
    discount: QuoteDiscountSchema.nullable().default(null),
  })
  .strip() satisfies z.ZodType<QuoteItem>;

export const QuoteAddressSchema = z
  .object({
    street_address: z.string().nullable().default(null),
    city: z.string().nullable().default(null),
    zip_code: z.string().nullable().default(null),
    province_code: z.string().nullable().default(null),
    country_code: z.string().nullable().default(null),
  })
  .strip() satisfies z.ZodType<QuoteAddress>;

export const QuoteClientSchema = z
  .object({
    id: z.string(),
    type: z.enum(["individual", "company", "freelancer"]),
    name: z.string().nullable().default(null),
    first_name: z.string().nullable().default(null),
    last_name: z.string().nullable().default(null),
    email: z.string().nullable().default(null),
    vat_number: z.string().nullable().default(null),
    tax_identification_number: z.string().nullable().default(null),
    address: z.string().nullable().default(null),
    city: z.string().nullable().default(null),
    zip_code: z.string().nullable().default(null),
    province_code: z.string().nullable().default(null),
    country_code: z.string().nullable().default(null),
    recipient_code: z.string().nullable().default(null),
    locale: z.string().nullable().default(null),
    billing_address: QuoteAddressSchema.nullable().default(null),
    delivery_address: QuoteAddressSchema.nullable().default(null),
  })
  .strip() satisfies z.ZodType<QuoteClient>;

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
    approved_at: z.string().nullable(),
    canceled_at: z.string().nullable(),
    attachment_id: z.string().nullable(),
    quote_url: z.string().nullable(),
    contact_email: z.string().nullable(),
    terms_and_conditions: z.string().nullable(),
    header: z.string().nullable(),
    footer: z.string().nullable(),
    discount: QuoteDiscountSchema.nullable().default(null),
    items: z.array(QuoteItemSchema).readonly(),
    client: QuoteClientSchema,
    invoice_ids: z.array(z.string()).readonly(),
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
