// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * An amount with value and currency as returned by the Qonto API.
 */
export interface QuoteAmount {
  readonly value: string;
  readonly currency: string;
}

/**
 * A discount applied to a quote or quote item.
 */
export interface QuoteDiscount {
  readonly type: "percentage" | "amount";
  readonly value: string;
  readonly amount: QuoteAmount;
  readonly amount_cents: number;
}

/**
 * A line item in a quote.
 */
export interface QuoteItem {
  readonly title: string;
  readonly description: string | null;
  readonly quantity: string;
  readonly unit: string | null;
  readonly vat_rate: string;
  readonly vat_exemption_reason: string | null;
  readonly unit_price: QuoteAmount;
  readonly unit_price_cents: number;
  readonly total_amount: QuoteAmount;
  readonly total_amount_cents: number;
  readonly total_vat: QuoteAmount;
  readonly total_vat_cents: number;
  readonly subtotal: QuoteAmount;
  readonly subtotal_cents: number;
  readonly discount: QuoteDiscount | null;
}

/**
 * An address embedded in a quote client.
 */
export interface QuoteAddress {
  readonly street_address: string | null;
  readonly city: string | null;
  readonly zip_code: string | null;
  readonly province_code: string | null;
  readonly country_code: string | null;
}

/**
 * A client embedded in a quote.
 */
export interface QuoteClient {
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
  readonly billing_address: QuoteAddress | null;
  readonly delivery_address: QuoteAddress | null;
}

/**
 * A Qonto quote (commercial proposal).
 */
export interface Quote {
  readonly id: string;
  readonly organization_id: string;
  readonly number: string;
  readonly status: "pending_approval" | "approved" | "canceled";
  readonly currency: string;
  readonly total_amount: QuoteAmount;
  readonly total_amount_cents: number;
  readonly vat_amount: QuoteAmount;
  readonly vat_amount_cents: number;
  readonly issue_date: string;
  readonly expiry_date: string;
  readonly created_at: string;
  readonly approved_at: string | null;
  readonly canceled_at: string | null;
  readonly attachment_id: string | null;
  readonly quote_url: string | null;
  readonly contact_email: string | null;
  readonly terms_and_conditions: string | null;
  readonly header: string | null;
  readonly footer: string | null;
  readonly discount: QuoteDiscount | null;
  readonly items: readonly QuoteItem[];
  readonly client: QuoteClient;
  readonly invoice_ids: readonly string[];
}
