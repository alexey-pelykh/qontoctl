// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { CreditNote, CreditNoteAmount, CreditNoteClient, CreditNoteItem } from "./credit-note.js";

export const CreditNoteAmountSchema = z
  .object({
    value: z.string(),
    currency: z.string(),
  })
  .strip() satisfies z.ZodType<CreditNoteAmount>;

export const CreditNoteItemSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    quantity: z.string(),
    unit: z.string(),
    unit_price: CreditNoteAmountSchema,
    unit_price_cents: z.number(),
    vat_rate: z.string(),
    total_vat: CreditNoteAmountSchema,
    total_vat_cents: z.number(),
    total_amount: CreditNoteAmountSchema,
    total_amount_cents: z.number(),
    subtotal: CreditNoteAmountSchema,
    subtotal_cents: z.number(),
  })
  .strip() satisfies z.ZodType<CreditNoteItem>;

export const CreditNoteClientSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    first_name: z.string(),
    last_name: z.string(),
    type: z.string(),
    email: z.string(),
    vat_number: z.string(),
    tax_identification_number: z.string(),
    address: z.string(),
    city: z.string(),
    zip_code: z.string(),
    country_code: z.string(),
    locale: z.string(),
  })
  .strip() satisfies z.ZodType<CreditNoteClient>;

export const CreditNoteSchema = z
  .object({
    id: z.string(),
    invoice_id: z.string(),
    attachment_id: z.string(),
    number: z.string(),
    issue_date: z.string(),
    invoice_issue_date: z.string(),
    header: z.string(),
    footer: z.string(),
    terms_and_conditions: z.string(),
    currency: z.string(),
    vat_amount: CreditNoteAmountSchema,
    vat_amount_cents: z.number(),
    total_amount: CreditNoteAmountSchema,
    total_amount_cents: z.number(),
    stamp_duty_amount: z.string(),
    created_at: z.string(),
    finalized_at: z.string(),
    contact_email: z.string(),
    invoice_url: z.string(),
    einvoicing_status: z.string(),
    items: z.array(CreditNoteItemSchema).readonly(),
    client: CreditNoteClientSchema,
  })
  .strip() satisfies z.ZodType<CreditNote>;

export const CreditNoteResponseSchema = z
  .object({
    credit_note: CreditNoteSchema,
  })
  .strip();

export const CreditNoteListResponseSchema = z
  .object({
    credit_notes: z.array(CreditNoteSchema),
    meta: PaginationMetaSchema,
  })
  .strip();
