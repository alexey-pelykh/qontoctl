// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * International transfer eligibility status.
 */
export interface IntlEligibility {
  readonly eligible: boolean;
  readonly reason?: string | undefined;
  readonly [key: string]: unknown;
}

/**
 * A supported currency for international transfers.
 */
export interface IntlCurrency {
  readonly code: string;
  readonly name: string;
  readonly min_amount?: number | undefined;
  readonly max_amount?: number | undefined;
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
