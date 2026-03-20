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
    invoice_number: z.string().nullable(),
    supplier_name: z.string().nullable(),
    total_amount: SupplierInvoiceAmountSchema.nullable(),
    total_amount_excluding_taxes: SupplierInvoiceAmountSchema.nullable(),
    total_tax_amount: SupplierInvoiceAmountSchema.nullable(),
    payable_amount: SupplierInvoiceAmountSchema.nullable(),
    issue_date: z.string().nullable(),
    due_date: z.string().nullable(),
    payment_date: z.string().nullable(),
    scheduled_date: z.string().nullable(),
    iban: z.string().nullable(),
    is_einvoice: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strip() satisfies z.ZodType<SupplierInvoice>;

export const SupplierInvoiceResponseSchema = z.object({
  supplier_invoice: SupplierInvoiceSchema,
});

export const SupplierInvoiceListResponseSchema = z.object({
  supplier_invoices: z.array(SupplierInvoiceSchema),
  meta: PaginationMetaSchema,
});

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
