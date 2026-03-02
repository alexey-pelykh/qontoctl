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
 */
export interface ClientInvoiceDiscount {
  readonly type: "percentage" | "amount";
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
  readonly unit: string | null;
  readonly vat_rate: string;
  readonly vat_exemption_reason: string | null;
  readonly unit_price: ClientInvoiceAmount;
  readonly unit_price_cents: number;
  readonly total_amount: ClientInvoiceAmount;
  readonly total_amount_cents: number;
  readonly total_vat: ClientInvoiceAmount;
  readonly total_vat_cents: number;
  readonly subtotal: ClientInvoiceAmount;
  readonly subtotal_cents: number;
  readonly discount: ClientInvoiceDiscount | null;
}

/**
 * An address embedded in a client invoice client.
 */
export interface ClientInvoiceAddress {
  readonly street_address: string | null;
  readonly city: string | null;
  readonly zip_code: string | null;
  readonly province_code: string | null;
  readonly country_code: string | null;
}

/**
 * A client embedded in a client invoice.
 */
export interface ClientInvoiceClient {
  readonly id: string;
  readonly type: "individual" | "company" | "freelancer";
  readonly name: string | null;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly email: string | null;
  readonly vat_number: string | null;
  readonly tax_identification_number: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly zip_code: string | null;
  readonly province_code: string | null;
  readonly country_code: string | null;
  readonly recipient_code: string | null;
  readonly locale: string | null;
  readonly billing_address: ClientInvoiceAddress | null;
  readonly delivery_address: ClientInvoiceAddress | null;
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
  readonly invoice_number: string | null;
  readonly status: "draft" | "pending" | "paid" | "cancelled";
  readonly client_id: string;
  readonly currency: string;
  readonly total_amount: ClientInvoiceAmount;
  readonly total_amount_cents: number;
  readonly vat_amount: ClientInvoiceAmount;
  readonly vat_amount_cents: number;
  readonly issue_date: string | null;
  readonly due_date: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly attachment_id: string | null;
  readonly contact_email: string | null;
  readonly terms_and_conditions: string | null;
  readonly header: string | null;
  readonly footer: string | null;
  readonly discount: ClientInvoiceDiscount | null;
  readonly items: readonly ClientInvoiceItem[];
  readonly client: ClientInvoiceClient;
}

/**
 * Parameters for listing client invoices.
 */
export interface ListClientInvoicesParams {
  readonly status?: readonly string[];
  readonly client_id?: string;
}
