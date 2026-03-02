// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Visual appearance details for a card.
 */
export interface CardAppearance {
  readonly assets: {
    readonly front_large: string;
    readonly front_small: string;
    readonly front_small_wallet: string;
  };
  readonly theme: "dark" | "light";
  readonly gradient_hex_color: string;
}

/**
 * Summary of the original card when this card is a renewal.
 */
export interface ParentCardSummary {
  readonly id: string;
  readonly last_digits: string;
}

/**
 * A Qonto card — physical, virtual, flash, or advertising.
 */
export interface Card {
  readonly id: string;
  readonly nickname: string;
  readonly embossed_name: string | null;
  readonly status:
    | "pending"
    | "live"
    | "paused"
    | "stolen"
    | "lost"
    | "pin_blocked"
    | "discarded"
    | "expired"
    | "shipped_lost"
    | "onhold"
    | "order_canceled"
    | "pre_expired"
    | "abusive";
  readonly pin_set: boolean;
  readonly mask_pan: string | null;
  readonly exp_month: string | null;
  readonly exp_year: string | null;
  readonly last_activity_at: string;
  readonly last_digits: string | null;
  readonly ship_to_business: boolean;
  readonly atm_option: boolean;
  readonly nfc_option: boolean;
  readonly online_option: boolean;
  readonly foreign_option: boolean;
  readonly atm_monthly_limit: number;
  readonly atm_monthly_spent: number;
  readonly atm_daily_limit: number;
  readonly atm_daily_spent: number;
  readonly atm_daily_limit_option: boolean;
  readonly payment_monthly_limit: number;
  readonly payment_monthly_spent: number;
  readonly payment_daily_limit: number;
  readonly payment_daily_spent: number;
  readonly payment_daily_limit_option: boolean;
  readonly payment_transaction_limit: number;
  readonly payment_transaction_limit_option: boolean;
  readonly active_days: readonly number[];
  readonly holder_id: string;
  readonly initiator_id: string;
  readonly bank_account_id: string;
  readonly organization_id: string;
  readonly updated_at: string;
  readonly created_at: string;
  readonly shipped_at: string | null;
  readonly card_type: "debit" | "prepaid";
  readonly card_level: "standard" | "plus" | "metal" | "virtual" | "virtual_partner" | "flash" | "advertising";
  readonly payment_lifespan_limit: number;
  readonly payment_lifespan_spent: number;
  readonly pre_expires_at: string | null;
  readonly categories: readonly string[];
  readonly renewed: boolean;
  readonly renewal: boolean;
  readonly parent_card_summary: ParentCardSummary | null;
  readonly had_operation: boolean;
  readonly had_pin_operation: boolean;
  readonly card_design: string;
  readonly type_of_print: "print" | "embossed" | null;
  readonly upsold: boolean;
  readonly upsell: boolean;
  readonly discard_on: string | null;
  readonly reordered: boolean;
  readonly appearance: CardAppearance;
  readonly has_only_user_liftable_locks: boolean;
}

/**
 * Appearance data for a specific card level.
 */
export interface CardLevelAppearance {
  readonly design: string;
  readonly assets: {
    readonly front_large: string;
    readonly front_small: string;
    readonly front_small_wallet: string;
  };
  readonly theme: "dark" | "light";
  readonly gradient_hex_color: string;
  readonly is_active: boolean;
}

/**
 * Card appearances grouped by card level.
 */
export interface CardLevelAppearances {
  readonly card_level: string;
  readonly appearances: readonly CardLevelAppearance[];
}

/**
 * Card appearances grouped by card type.
 */
export interface CardTypeAppearances {
  readonly card_type: string;
  readonly card_level_appearances: readonly CardLevelAppearances[];
}
