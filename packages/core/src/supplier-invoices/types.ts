// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A monetary amount with value and currency as returned by the Qonto API.
 */
export interface SupplierInvoiceAmount {
  readonly value: string;
  readonly currency: string;
}

/**
 * A supplier invoice as returned by the Qonto API.
 */
export interface SupplierInvoice {
  readonly id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly source_type: string;
  readonly source: string;
  readonly attachment_id: string;
  readonly display_attachment_id: string;
  readonly file_name: string;
  readonly invoice_number: string | null;
  readonly supplier_name: string | null;
  readonly total_amount: SupplierInvoiceAmount | null;
  readonly total_amount_excluding_taxes: SupplierInvoiceAmount | null;
  readonly total_tax_amount: SupplierInvoiceAmount | null;
  readonly payable_amount: SupplierInvoiceAmount | null;
  readonly issue_date: string | null;
  readonly due_date: string | null;
  readonly payment_date: string | null;
  readonly scheduled_date: string | null;
  readonly iban: string | null;
  readonly is_einvoice: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Parameters for listing supplier invoices.
 */
export interface ListSupplierInvoicesParams {
  readonly status?: readonly string[];
  readonly due_date?: string;
  readonly created_at_from?: string;
  readonly created_at_to?: string;
  readonly updated_at_from?: string;
  readonly updated_at_to?: string;
  readonly query?: string;
  readonly sort_by?: string;
}

/**
 * A single entry for the bulk create endpoint.
 */
export interface BulkCreateSupplierInvoiceEntry {
  readonly file: Blob;
  readonly fileName: string;
  readonly idempotencyKey: string;
}

/**
 * An error from the bulk create response.
 */
export interface BulkCreateSupplierInvoiceError {
  readonly code: string;
  readonly detail: string;
  readonly source?: {
    readonly pointer?: string;
  };
}

/**
 * Response from the bulk create endpoint. Always returns HTTP 200;
 * check the `errors` array for per-invoice failures.
 */
export interface BulkCreateSupplierInvoicesResult {
  readonly supplier_invoices: readonly SupplierInvoice[];
  readonly errors: readonly BulkCreateSupplierInvoiceError[];
}
