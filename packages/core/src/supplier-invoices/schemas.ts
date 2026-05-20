// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type {
  BulkCreateSupplierInvoiceError,
  BulkCreateSupplierInvoicesResult,
  SupplierInvoice,
  SupplierInvoiceAmount,
} from "./types.js";

/**
 * Schema for a monetary amount with value and currency.
 */
export const SupplierInvoiceAmountSchema = z
  .object({
    value: z.string(),
    currency: z.string(),
  })
  .strip() satisfies z.ZodType<SupplierInvoiceAmount>;

/**
 * Schema for a supplier invoice returned by the Qonto API.
 *
 * Additions for #621 (genuine extra_fields drift surfaced by contract probe).
 * All declared `.nullable().optional()` so the schema accepts the live
 * response without making over-strong type guarantees. Best-guess types are
 * applied per probe observation; complex shapes (`available_actions`, `meta`,
 * `approval_workflow`, `einvoicing_lifecycle_events`, `related_invoices`,
 * `request_transfer`) are kept permissive (record/array/unknown) because the
 * API shape is undocumented and likely environment-specific. Consumers
 * requiring richer typing should add typed sub-schemas in a follow-up PR
 * once shapes are pinned via multi-sample probe runs.
 */
export const SupplierInvoiceSchema = z
  .object({
    id: z.string(),
    organization_id: z.string(),
    status: z.string(),
    source_type: z.string(),
    source: z.string(),
    attachment_id: z.string(),
    display_attachment_id: z.string(),
    file_name: z.string(),
    invoice_number: z.string().nullable().optional(),
    supplier_name: z.string().nullable().optional(),
    total_amount: SupplierInvoiceAmountSchema.nullable().optional(),
    total_amount_excluding_taxes: SupplierInvoiceAmountSchema.nullable().optional(),
    total_tax_amount: SupplierInvoiceAmountSchema.nullable().optional(),
    payable_amount: SupplierInvoiceAmountSchema.nullable().optional(),
    issue_date: z.string().nullable().optional(),
    due_date: z.string().nullable().optional(),
    payment_date: z.string().nullable().optional(),
    scheduled_date: z.string().nullable().optional(),
    iban: z.string().nullable().optional(),
    is_einvoice: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
    supplier_id: z.string().nullable().optional(),
    issuer_name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    total_amount_credit_notes: SupplierInvoiceAmountSchema.nullable().optional(),
    initiator_id: z.string().nullable().optional(),
    attachment_category: z.string().nullable().optional(),
    analyzed_at: z.string().nullable().optional(),
    request_transfer: z.unknown().nullable().optional(),
    self_invoice_id: z.string().nullable().optional(),
    is_attachment_invoice: z.boolean().nullable().optional(),
    is_attachment_non_financial: z.boolean().nullable().optional(),
    has_duplicates: z.boolean().nullable().optional(),
    available_actions: z.record(z.string(), z.unknown()).nullable().optional(),
    has_discrepancies: z.boolean().nullable().optional(),
    einvoicing_lifecycle_events: z.array(z.unknown()).nullable().optional(),
    meta: z.record(z.string(), z.unknown()).nullable().optional(),
    approval_workflow: z.record(z.string(), z.unknown()).nullable().optional(),
    is_credit_note: z.boolean().nullable().optional(),
    related_invoices: z.array(z.unknown()).nullable().optional(),
    has_suggested_credit_notes: z.boolean().nullable().optional(),
  })
  .strip() satisfies z.ZodType<SupplierInvoice>;

export const SupplierInvoiceResponseSchema = z
  .object({
    supplier_invoice: SupplierInvoiceSchema,
  })
  .strip();

export const SupplierInvoiceListResponseSchema = z
  .object({
    supplier_invoices: z.array(SupplierInvoiceSchema),
    meta: PaginationMetaSchema,
  })
  .strip();

/**
 * Schema for an error from the bulk create response.
 */
export const BulkCreateSupplierInvoiceErrorSchema = z
  .object({
    code: z.string(),
    detail: z.string(),
    source: z
      .object({
        pointer: z.string().optional(),
      })
      .strip()
      .optional(),
  })
  .strip() satisfies z.ZodType<Omit<BulkCreateSupplierInvoiceError, "source">>;

/**
 * Schema for the bulk create supplier invoices response.
 */
export const BulkCreateSupplierInvoicesResultSchema = z
  .object({
    supplier_invoices: z.array(SupplierInvoiceSchema).readonly(),
    errors: z.array(BulkCreateSupplierInvoiceErrorSchema).readonly(),
  })
  .strip() satisfies z.ZodType<Omit<BulkCreateSupplierInvoicesResult, "errors">>;
