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
 *
 * `type` accepts `"absolute"` in addition to the documented `"percentage"`
 * and `"amount"` because the live `/v2/quotes` API returns `"absolute"` for
 * fixed-amount discounts (reported in #496).
 */
export interface QuoteDiscount {
  readonly type: "percentage" | "absolute" | "amount";
  readonly value: string;
  readonly amount: QuoteAmount;
  readonly amount_cents: number;
}

/**
 * A line item in a quote.
 */
export interface QuoteItem {
  readonly title: string;
  readonly description?: string | null | undefined;
  readonly quantity: string;
  readonly unit?: string | null | undefined;
  readonly vat_rate: string;
  readonly vat_exemption_reason?: string | null | undefined;
  readonly unit_price: QuoteAmount;
  readonly unit_price_cents: number;
  readonly total_amount: QuoteAmount;
  readonly total_amount_cents: number;
  readonly total_vat: QuoteAmount;
  readonly total_vat_cents: number;
  readonly subtotal: QuoteAmount;
  readonly subtotal_cents: number;
  readonly discount?: QuoteDiscount | null | undefined;
}

/**
 * An address embedded in a quote client.
 */
export interface QuoteAddress {
  readonly street_address?: string | null | undefined;
  readonly city?: string | null | undefined;
  readonly zip_code?: string | null | undefined;
  readonly province_code?: string | null | undefined;
  readonly country_code?: string | null | undefined;
}

/**
 * A client embedded in a quote.
 */
export interface QuoteClient {
  readonly id: string;
  readonly type: "individual" | "company" | "freelancer";
  readonly name?: string | null | undefined;
  readonly first_name?: string | null | undefined;
  readonly last_name?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly vat_number?: string | null | undefined;
  readonly tax_identification_number?: string | null | undefined;
  readonly address?: string | null | undefined;
  readonly city?: string | null | undefined;
  readonly zip_code?: string | null | undefined;
  readonly province_code?: string | null | undefined;
  readonly country_code?: string | null | undefined;
  readonly recipient_code?: string | null | undefined;
  readonly locale?: string | null | undefined;
  readonly billing_address?: QuoteAddress | null | undefined;
  readonly delivery_address?: QuoteAddress | null | undefined;
}

/**
 * A Qonto quote (commercial proposal).
 *
 * `stamp_duty_amount` is the Italian-market stamp-duty (marca da bollo) fiscal
 * amount applied to the quote, returned as a decimal string per the API's
 * monetary-amount convention. Permissive (`.nullable().optional()`) because
 * the field is omitted for non-Italian markets where stamp duty does not apply
 * (#621 schema completeness).
 *
 * `organization` is the embedded summary of the issuing organization. Shape
 * is kept permissive (`Record<string, unknown>`) to follow the same minimal-
 * coupling precedent as {@link Organization} — consumers that need typed
 * org-summary fields should call the dedicated `/v2/organization` endpoint
 * (#621).
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
  readonly approved_at?: string | null | undefined;
  readonly canceled_at?: string | null | undefined;
  readonly attachment_id?: string | null | undefined;
  readonly quote_url?: string | null | undefined;
  readonly contact_email?: string | null | undefined;
  readonly terms_and_conditions?: string | null | undefined;
  readonly header?: string | null | undefined;
  readonly footer?: string | null | undefined;
  readonly discount?: QuoteDiscount | null | undefined;
  readonly items: readonly QuoteItem[];
  readonly client: QuoteClient;
  readonly invoice_ids?: readonly string[] | undefined;
  readonly stamp_duty_amount?: string | null | undefined;
  readonly organization?: Readonly<Record<string, unknown>> | null | undefined;
}
