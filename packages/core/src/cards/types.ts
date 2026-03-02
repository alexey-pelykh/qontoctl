// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Parameters for listing cards.
 */
export interface ListCardsParams {
  readonly query?: string;
  readonly sort_by?: string;
  readonly holder_ids?: readonly string[];
  readonly statuses?: readonly string[];
  readonly bank_account_ids?: readonly string[];
  readonly card_levels?: readonly string[];
  readonly ids?: readonly string[];
}

/**
 * Shipping address for a physical card.
 */
export interface CardAddress {
  readonly contact_name: string;
  readonly first_line: string;
  readonly second_line?: string;
  readonly third_line?: string;
  readonly zipcode: string;
  readonly city: string;
  readonly country: string;
}

/**
 * Parameters for creating a card.
 */
export interface CreateCardParams {
  readonly holder_id: string;
  readonly initiator_id: string;
  readonly organization_id: string;
  readonly bank_account_id: string;
  readonly card_level: string;
  readonly ship_to_business?: boolean;
  readonly atm_option?: boolean;
  readonly nfc_option?: boolean;
  readonly foreign_option?: boolean;
  readonly online_option?: boolean;
  readonly atm_monthly_limit?: number;
  readonly atm_daily_limit_option?: boolean;
  readonly atm_daily_limit?: number;
  readonly payment_monthly_limit?: number;
  readonly payment_daily_limit_option?: boolean;
  readonly payment_daily_limit?: number;
  readonly payment_transaction_limit_option?: boolean;
  readonly payment_transaction_limit?: number;
  readonly payment_lifespan_limit?: number;
  readonly pre_expires_at?: string;
  readonly active_days?: readonly number[];
  readonly categories?: readonly string[];
  readonly card_design?: string;
  readonly type_of_print?: string;
  readonly address?: CardAddress;
}

/**
 * Parameters for updating card spending limits.
 */
export interface UpdateCardLimitsParams {
  readonly atm_monthly_limit?: number;
  readonly atm_daily_limit_option?: boolean;
  readonly atm_daily_limit?: number;
  readonly payment_monthly_limit?: number;
  readonly payment_daily_limit_option?: boolean;
  readonly payment_daily_limit?: number;
  readonly payment_transaction_limit_option?: boolean;
  readonly payment_transaction_limit?: number;
  readonly payment_lifespan_limit?: number;
}

/**
 * Parameters for updating card options.
 */
export interface UpdateCardOptionsParams {
  readonly atm_option: boolean;
  readonly nfc_option: boolean;
  readonly online_option: boolean;
  readonly foreign_option: boolean;
}

/**
 * Parameters for updating card restrictions.
 */
export interface UpdateCardRestrictionsParams {
  readonly active_days?: readonly number[];
  readonly categories?: readonly string[];
}
