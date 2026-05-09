// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * International transfer eligibility status.
 *
 * The Qonto sandbox returns a flat object such as
 * `{ "status": "STATUS_INELIGIBLE", "reason": "REASON_UNKNOWN" }`. Both fields
 * are string enums; we keep them as `string` for forward compatibility with
 * future enum values.
 */
export interface IntlEligibility {
  readonly status: string;
  readonly reason?: string | undefined;
  readonly [key: string]: unknown;
}

/**
 * A supported currency for international transfers.
 *
 * The Qonto API returns each currency as
 * `{ "country_code": "US", "currency_code": "USD", "suggestion_priority": 6 }`.
 * `suggestion_priority` is present only for top-suggested entries.
 */
export interface IntlCurrency {
  readonly country_code: string;
  readonly currency_code: string;
  readonly suggestion_priority?: number | undefined;
  readonly [key: string]: unknown;
}

/**
 * An international transfer quote with exchange rate.
 */
export interface IntlQuote {
  readonly id: string;
  readonly source_currency: string;
  readonly target_currency: string;
  readonly source_amount: number;
  readonly target_amount: number;
  readonly rate: number;
  readonly fee_amount: number;
  readonly fee_currency: string;
  readonly expires_at: string;
  readonly [key: string]: unknown;
}

/**
 * Parameters for creating an international transfer quote.
 */
export interface CreateIntlQuoteParams {
  readonly currency: string;
  readonly amount: number;
  readonly direction: "send" | "receive";
}
