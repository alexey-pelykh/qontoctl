// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * An amount with value and currency as returned by the Qonto API.
 */
export interface ClientInvoiceAmount {
  readonly value: string;
  readonly currency: string;
}

/**
 * A discount applied to a client invoice or invoice item.
 *
 * `type` accepts `"absolute"` in addition to `"percentage"` and `"amount"`
 * for consistency with `QuoteDiscount` — Qonto's client-invoice docs use
 * `"absolute"` canonically. See #496.
 */
export interface ClientInvoiceDiscount {
  readonly type: "percentage" | "absolute" | "amount";
  readonly value: string;
  readonly amount: ClientInvoiceAmount;
  readonly amount_cents: number;
}

/**
 * A line item in a client invoice.
 */
export interface ClientInvoiceItem {
  readonly title: string;
  readonly description: string | null;
  readonly quantity: string;
  readonly unit?: string | null | undefined;
  readonly vat_rate: string;
  readonly vat_exemption_reason?: string | null | undefined;
  readonly unit_price: ClientInvoiceAmount;
  readonly unit_price_cents: number;
  readonly total_amount: ClientInvoiceAmount;
  readonly total_amount_cents: number;
  readonly total_vat: ClientInvoiceAmount;
  readonly total_vat_cents: number;
  readonly subtotal: ClientInvoiceAmount;
  readonly subtotal_cents: number;
  readonly discount?: ClientInvoiceDiscount | null | undefined;
}

/**
 * An address embedded in a client invoice client.
 */
export interface ClientInvoiceAddress {
  readonly street_address: string | null;
  readonly city: string | null;
  readonly zip_code: string | null;
  readonly province_code?: string | null | undefined;
  readonly country_code: string | null;
}

/**
 * A client embedded in a client invoice.
 *
 * `first_name` and `last_name` are returned only when `type` is
 * `"individual"` or `"freelancer"` — they are omitted entirely (not just
 * null) for `type: "company"`.
 */
export interface ClientInvoiceClient {
  readonly id: string;
  readonly type: "individual" | "company" | "freelancer";
  readonly name: string | null;
  readonly first_name?: string | null | undefined;
  readonly last_name?: string | null | undefined;
  readonly email: string | null;
  readonly vat_number: string | null;
  readonly tax_identification_number: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly zip_code: string | null;
  readonly province_code?: string | null | undefined;
  readonly country_code: string | null;
  readonly recipient_code?: string | null | undefined;
  readonly locale: string | null;
  readonly billing_address: ClientInvoiceAddress | null;
  readonly delivery_address?: ClientInvoiceAddress | null | undefined;
}

/**
 * An upload attached to a client invoice.
 */
export interface ClientInvoiceUpload {
  readonly id: string;
  readonly file_name: string;
  readonly file_size: number;
  readonly file_content_type: string;
  readonly url: string;
  readonly created_at: string;
}

/**
 * A Qonto client invoice.
 */
export interface ClientInvoice {
  readonly id: string;
  readonly organization_id: string;
  readonly invoice_number?: string | null | undefined;
  readonly status: string;
  readonly client_id?: string | undefined;
  readonly currency: string;
  readonly total_amount: ClientInvoiceAmount;
  readonly total_amount_cents: number;
  readonly vat_amount: ClientInvoiceAmount;
  readonly vat_amount_cents: number;
  readonly issue_date: string | null;
  readonly due_date: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly attachment_id?: string | null | undefined;
  readonly contact_email: string | null;
  readonly terms_and_conditions: string | null;
  readonly header: string | null;
  readonly footer: string | null;
  readonly discount?: ClientInvoiceDiscount | null | undefined;
  readonly items: readonly ClientInvoiceItem[];
  readonly client: ClientInvoiceClient;
}

/**
 * A line item for creating or updating a client invoice.
 */
export interface ClientInvoiceItemParams {
  readonly title: string;
  readonly quantity: string;
  readonly unit_price: ClientInvoiceAmount;
  readonly vat_rate: string;
  readonly description?: string | undefined;
  readonly unit?: string | undefined;
}

/**
 * A discount for creating or updating a client invoice.
 */
export interface ClientInvoiceDiscountParams {
  readonly type: "percentage" | "amount";
  readonly value: string;
}

/**
 * Parameters for creating a client invoice.
 */
export interface CreateClientInvoiceParams {
  readonly client_id: string;
  readonly issue_date: string;
  readonly due_date: string;
  readonly currency: string;
  readonly terms_and_conditions: string;
  readonly items: readonly ClientInvoiceItemParams[];
  readonly header?: string | undefined;
  readonly footer?: string | undefined;
  readonly discount?: ClientInvoiceDiscountParams | undefined;
}

/**
 * Parameters for updating a client invoice.
 */
export interface UpdateClientInvoiceParams {
  readonly issue_date?: string | undefined;
  readonly due_date?: string | undefined;
  readonly currency?: string | undefined;
  readonly terms_and_conditions?: string | undefined;
  readonly header?: string | undefined;
  readonly footer?: string | undefined;
  readonly items?: readonly ClientInvoiceItemParams[] | undefined;
  readonly discount?: ClientInvoiceDiscountParams | undefined;
}

/**
 * Parameters for listing client invoices.
 */
export interface ListClientInvoicesParams {
  readonly status?: readonly string[];
  readonly created_at_from?: string;
  readonly created_at_to?: string;
  readonly updated_at_from?: string;
  readonly updated_at_to?: string;
  readonly due_date?: string;
  readonly due_date_from?: string;
  readonly due_date_to?: string;
  readonly exclude_imported?: boolean;
  readonly sort_by?: string;
}
