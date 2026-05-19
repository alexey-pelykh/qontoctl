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
 *
 * Many of the fields below — `supplier_id`, `issuer_name`, `description`,
 * `total_amount_credit_notes`, `initiator_id`, `attachment_category`,
 * `analyzed_at`, `request_transfer`, `self_invoice_id`,
 * `is_attachment_invoice`, `is_attachment_non_financial`, `has_duplicates`,
 * `available_actions`, `has_discrepancies`, `einvoicing_lifecycle_events`,
 * `meta`, `approval_workflow`, `is_credit_note`, `related_invoices`,
 * `has_suggested_credit_notes` — were surfaced as undeclared API drift by
 * the contract probe (#621). They are declared permissively
 * (`.nullable().optional()`) so the schema accepts the live response without
 * making over-strong type guarantees:
 *
 * - Scalar string-shaped IDs (`supplier_id`, `initiator_id`, `self_invoice_id`)
 *   and timestamp fields (`analyzed_at`) are typed as `string`.
 * - Boolean flags (`is_attachment_invoice`, `is_attachment_non_financial`,
 *   `has_duplicates`, `has_discrepancies`, `is_credit_note`,
 *   `has_suggested_credit_notes`) are typed as `boolean`.
 * - `total_amount_credit_notes` reuses {@link SupplierInvoiceAmount} — same
 *   `{ value, currency }` shape as the other amount fields.
 * - `available_actions`, `meta`, `approval_workflow` are workflow / metadata
 *   objects with shapes that are undocumented and likely environment-specific;
 *   declared as permissive `Record<string, unknown>`.
 * - `einvoicing_lifecycle_events` and `related_invoices` are arrays whose
 *   element shape is undocumented; declared as `readonly unknown[]`.
 * - `request_transfer` is a workflow-related field of unclear shape; declared
 *   as `unknown` (presence acknowledged; shape not constrained).
 *
 * Consumers requiring stronger typing on any of these fields should add a
 * typed sub-schema in a follow-up PR once the API shape is documented or
 * empirically pinned via a multi-sample probe run.
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
  readonly invoice_number?: string | null | undefined;
  readonly supplier_name?: string | null | undefined;
  readonly total_amount?: SupplierInvoiceAmount | null | undefined;
  readonly total_amount_excluding_taxes?: SupplierInvoiceAmount | null | undefined;
  readonly total_tax_amount?: SupplierInvoiceAmount | null | undefined;
  readonly payable_amount?: SupplierInvoiceAmount | null | undefined;
  readonly issue_date?: string | null | undefined;
  readonly due_date?: string | null | undefined;
  readonly payment_date?: string | null | undefined;
  readonly scheduled_date?: string | null | undefined;
  readonly iban?: string | null | undefined;
  readonly is_einvoice: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly supplier_id?: string | null | undefined;
  readonly issuer_name?: string | null | undefined;
  readonly description?: string | null | undefined;
  readonly total_amount_credit_notes?: SupplierInvoiceAmount | null | undefined;
  readonly initiator_id?: string | null | undefined;
  readonly attachment_category?: string | null | undefined;
  readonly analyzed_at?: string | null | undefined;
  readonly request_transfer?: unknown;
  readonly self_invoice_id?: string | null | undefined;
  readonly is_attachment_invoice?: boolean | null | undefined;
  readonly is_attachment_non_financial?: boolean | null | undefined;
  readonly has_duplicates?: boolean | null | undefined;
  readonly available_actions?: Readonly<Record<string, unknown>> | null | undefined;
  readonly has_discrepancies?: boolean | null | undefined;
  readonly einvoicing_lifecycle_events?: readonly unknown[] | null | undefined;
  readonly meta?: Readonly<Record<string, unknown>> | null | undefined;
  readonly approval_workflow?: Readonly<Record<string, unknown>> | null | undefined;
  readonly is_credit_note?: boolean | null | undefined;
  readonly related_invoices?: readonly unknown[] | null | undefined;
  readonly has_suggested_credit_notes?: boolean | null | undefined;
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
  readonly attachment_id?: string;
  readonly attachment_ids?: readonly string[];
  readonly payment_date?: string;
  readonly issue_date?: string;
  readonly issue_date_from?: string;
  readonly missing_data?: boolean;
  readonly matched_transactions?: boolean;
  readonly document_type?: string;
  readonly approver_ids?: readonly string[];
  readonly exclude_credit_notes?: boolean;
  readonly payable_amount?: string;
  readonly query_fields?: string;
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
