// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type {
  ClientInvoice,
  ClientInvoiceAddress,
  ClientInvoiceAmount,
  ClientInvoiceClient,
  ClientInvoiceDiscount,
  ClientInvoiceItem,
  ClientInvoiceUpload,
} from "./types.js";

export const ClientInvoiceAmountSchema = z
  .object({
    value: z.string(),
    currency: z.string(),
  })
  .strip() satisfies z.ZodType<ClientInvoiceAmount>;

// Qonto's client-invoice-endpoint docs use `"absolute"` canonically for the
// same semantic that the quote-endpoint docs call `"amount"`. Accept all three
// values to remain consistent with QuoteDiscountSchema and forward-compatible
// regardless of which surface Qonto cleans up first. See #496.
export const ClientInvoiceDiscountSchema = z
  .object({
    type: z.enum(["percentage", "absolute", "amount"]),
    value: z.string(),
    amount: ClientInvoiceAmountSchema,
    amount_cents: z.number(),
  })
  .strip() satisfies z.ZodType<ClientInvoiceDiscount>;

// Per Qonto's client-invoice-endpoint docs, the nested DocumentItem schema
// has no `required:` list — every field MAY be omitted entirely. Relaxed
// `description` from `.nullable()` to `.nullable().optional()` to match the
// pattern used elsewhere in this Item schema (R-SS-1 / #604).
export const ClientInvoiceItemSchema = z
  .object({
    title: z.string(),
    description: z.string().nullable().optional(),
    quantity: z.string(),
    unit: z.string().nullable().optional(),
    vat_rate: z.string(),
    vat_exemption_reason: z.string().nullable().optional(),
    unit_price: ClientInvoiceAmountSchema,
    unit_price_cents: z.number(),
    total_amount: ClientInvoiceAmountSchema,
    total_amount_cents: z.number(),
    total_vat: ClientInvoiceAmountSchema,
    total_vat_cents: z.number(),
    subtotal: ClientInvoiceAmountSchema,
    subtotal_cents: z.number(),
    discount: ClientInvoiceDiscountSchema.nullable().optional(),
  })
  .strip() satisfies z.ZodType<ClientInvoiceItem>;

// Per Qonto's client-invoice-endpoint docs, the nested Address schemas
// (ClientBillingAddress / ClientDeliveryAddress) have no `required:` list —
// every field MAY be omitted entirely. Relaxed to `.nullable().optional()`
// (R-SS-1 / #604 pattern).
export const ClientInvoiceAddressSchema = z
  .object({
    street_address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    zip_code: z.string().nullable().optional(),
    province_code: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
  })
  .strip() satisfies z.ZodType<ClientInvoiceAddress>;

// Per Qonto's client-invoice-endpoint docs, the EmbeddedClient schema has
// no `required:` list — every field other than `id` and `type` MAY be
// omitted entirely. Relaxed all remaining `.nullable()`-only fields to
// `.nullable().optional()` (R-SS-1 / #604 pattern). `first_name` /
// `last_name` were already relaxed (#496) per the company-type carve-out.
export const ClientInvoiceClientSchema = z
  .object({
    id: z.string(),
    type: z.enum(["individual", "company", "freelancer"]),
    name: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    vat_number: z.string().nullable().optional(),
    tax_identification_number: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    zip_code: z.string().nullable().optional(),
    province_code: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
    recipient_code: z.string().nullable().optional(),
    locale: z.string().nullable().optional(),
    billing_address: ClientInvoiceAddressSchema.nullable().optional(),
    delivery_address: ClientInvoiceAddressSchema.nullable().optional(),
  })
  .strip() satisfies z.ZodType<ClientInvoiceClient>;

export const ClientInvoiceUploadSchema = z
  .object({
    id: z.string(),
    file_name: z.string(),
    file_size: z.number(),
    file_content_type: z.string(),
    url: z.string(),
    created_at: z.string(),
  })
  .strip() satisfies z.ZodType<ClientInvoiceUpload>;

// Per Qonto's client-invoice-endpoint docs, `ClientInvoice.required` covers
// (among others): id, organization_id, number, purchase_order, status,
// invoice_url, contact_email, terms_and_conditions, header, footer,
// currency, total_amount{,_cents}, vat_amount{,_cents}, issue_date,
// due_date, created_at, finalized_at, paid_at, items, client, payment_methods,
// credit_notes_ids, organization, invoice_type.
//
// Fields that are IN `required:` but whose VALUE is nullable per Qonto
// (`contact_email`, `terms_and_conditions`, `header`, `footer`, `issue_date`,
// `due_date`) keep `.nullable()` (no `.optional()`) per L2 audit
// (#601, R-SS-2 — field presence is guaranteed by the contract).
//
// Fields NOT in `required:` (`attachment_id`, `discount`) are `.nullable().optional()`
// — they MAY be omitted entirely per Qonto's OpenAPI semantics (#496 / #604 pattern).
export const ClientInvoiceSchema = z
  .object({
    id: z.string(),
    organization_id: z.string(),
    invoice_number: z.string().nullable().optional(),
    status: z.string(),
    client_id: z.string().optional(),
    currency: z.string(),
    total_amount: ClientInvoiceAmountSchema,
    total_amount_cents: z.number(),
    vat_amount: ClientInvoiceAmountSchema,
    vat_amount_cents: z.number(),
    issue_date: z.string().nullable(),
    due_date: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    attachment_id: z.string().nullable().optional(),
    contact_email: z.string().nullable(),
    terms_and_conditions: z.string().nullable(),
    header: z.string().nullable(),
    footer: z.string().nullable(),
    discount: ClientInvoiceDiscountSchema.nullable().optional(),
    // Qonto returns `items: null` for drafts with no line items (not `[]`).
    // Normalize at the schema boundary so consumers always see `ClientInvoiceItem[]`.
    items: z
      .array(ClientInvoiceItemSchema)
      .nullable()
      .transform((v) => v ?? []),
    client: ClientInvoiceClientSchema,
    // Additions for #621 (genuine extra_fields drift surfaced by contract probe).
    // All declared `.nullable().optional()` so the schema accepts the live
    // response without making over-strong type guarantees. Several of these
    // fields (`number`, `purchase_order`, `invoice_url`, `finalized_at`,
    // `paid_at`, `payment_methods`, `credit_notes_ids`, `organization`,
    // `invoice_type`) appear in the docs' `required:` list quoted above, so a
    // strict R-SS-2 reading would call for `.nullable()` (no `.optional()`).
    // The deliberate departure: a single-sample probe is insufficient to
    // assert per-field presence guarantees (e.g., `paid_at` is logically
    // absent on unpaid invoices despite the docs listing it as required).
    // These can tighten to `.nullable()` in a follow-up once multi-sample
    // probe data confirms guaranteed presence. Per-field notes:
    // - `number` is the canonical invoice identifier; coexists with the
    //   legacy `invoice_number` field (consumers prefer `number` when present).
    // - `amount_paid` reuses the standard `{ value, currency }` Amount shape.
    // - `payment_methods` element shape is undocumented; `unknown[]` is safer
    //   than an inferred-and-likely-wrong inner schema.
    // - `credit_notes_ids` is the conventional Qonto "UUID-string array" pattern.
    // - `organization` is the embedded org summary; shape kept permissive
    //   (`z.record(...)`) — same minimal-coupling precedent as Quote.organization.
    number: z.string().nullable().optional(),
    purchase_order: z.string().nullable().optional(),
    invoice_url: z.string().nullable().optional(),
    discount_conditions: z.string().nullable().optional(),
    late_payment_penalties: z.string().nullable().optional(),
    legal_fixed_compensation: z.string().nullable().optional(),
    amount_paid: ClientInvoiceAmountSchema.nullable().optional(),
    performance_date: z.string().nullable().optional(),
    performance_start_date: z.string().nullable().optional(),
    performance_end_date: z.string().nullable().optional(),
    finalized_at: z.string().nullable().optional(),
    paid_at: z.string().nullable().optional(),
    invoice_type: z.string().nullable().optional(),
    stamp_duty_amount: z.string().nullable().optional(),
    payment_methods: z.array(z.unknown()).nullable().optional(),
    credit_notes_ids: z.array(z.string()).nullable().optional(),
    organization: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strip() satisfies z.ZodType<ClientInvoice>;

export const ClientInvoiceResponseSchema = z
  .object({
    client_invoice: ClientInvoiceSchema,
  })
  .strip();

export const ClientInvoiceListResponseSchema = z
  .object({
    client_invoices: z.array(ClientInvoiceSchema),
    meta: PaginationMetaSchema,
  })
  .strip();
