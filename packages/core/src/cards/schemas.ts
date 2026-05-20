// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";

/**
 * Visual appearance details for a card.
 *
 * `gradient_hex_color` is optional — the Qonto API omits it for some card
 * designs (verified empirically against `/v2/cards`).
 */
export const CardAppearanceSchema = z
  .object({
    assets: z.object({
      front_large: z.string(),
      front_small: z.string(),
      front_small_wallet: z.string(),
    }),
    theme: z.enum(["dark", "light"]),
    gradient_hex_color: z.string().optional(),
  })
  .strip();

/**
 * Summary of the original card when this card is a renewal.
 */
export const ParentCardSummarySchema = z
  .object({
    id: z.string(),
    last_digits: z.string(),
  })
  .strip();

/**
 * A Qonto card — physical, virtual, flash, or advertising.
 */
export const CardSchema = z
  .object({
    id: z.string(),
    nickname: z.string(),
    embossed_name: z.string().nullable().optional(),
    status: z.enum([
      "pending",
      "live",
      "paused",
      "stolen",
      "lost",
      "pin_blocked",
      "discarded",
      "expired",
      "shipped_lost",
      "onhold",
      "order_canceled",
      "pre_expired",
      "abusive",
    ]),
    pin_set: z.boolean(),
    mask_pan: z.string().nullable().optional(),
    exp_month: z.string().nullable().optional(),
    exp_year: z.string().nullable().optional(),
    last_activity_at: z.string(),
    last_digits: z.string().nullable().optional(),
    ship_to_business: z.boolean(),
    atm_option: z.boolean(),
    nfc_option: z.boolean(),
    online_option: z.boolean(),
    foreign_option: z.boolean(),
    atm_monthly_limit: z.number(),
    atm_monthly_spent: z.number(),
    atm_daily_limit: z.number(),
    atm_daily_spent: z.number(),
    atm_daily_limit_option: z.boolean(),
    payment_monthly_limit: z.number(),
    payment_monthly_spent: z.number(),
    payment_daily_limit: z.number(),
    payment_daily_spent: z.number(),
    payment_daily_limit_option: z.boolean(),
    payment_transaction_limit: z.number(),
    payment_transaction_limit_option: z.boolean(),
    active_days: z.array(z.number()),
    holder_id: z.string(),
    initiator_id: z.string().optional(),
    bank_account_id: z.string(),
    organization_id: z.string(),
    updated_at: z.string(),
    created_at: z.string(),
    shipped_at: z.string().nullable().optional(),
    card_type: z.enum(["debit", "prepaid"]),
    card_level: z.enum(["standard", "plus", "metal", "virtual", "virtual_partner", "flash", "advertising"]),
    payment_lifespan_limit: z.number().nullable().optional(),
    payment_lifespan_spent: z.number(),
    pre_expires_at: z.string().nullable().optional(),
    categories: z.array(z.string()),
    renewed: z.boolean(),
    renewal: z.boolean(),
    parent_card_summary: ParentCardSummarySchema.nullable().optional(),
    had_operation: z.boolean(),
    had_pin_operation: z.boolean(),
    card_design: z.string(),
    type_of_print: z.enum(["print", "embossed"]).nullable().optional(),
    upsold: z.boolean(),
    upsell: z.boolean(),
    discard_on: z.string().nullable().optional(),
    reordered: z.boolean(),
    appearance: CardAppearanceSchema,
    has_only_user_liftable_locks: z.boolean(),
    // Post-#619/#624/#625/#626 contract-probe run additions (sandbox
    // 2026-05-20). `shipped_lost_at` mirrors the existing `shipped_at` /
    // `discard_on` date-string convention; the three booleans are observed
    // permissively.
    shipped_lost_at: z.string().nullable().optional(),
    eligible_for_renewal: z.boolean().nullable().optional(),
    eligible_for_upsell: z.boolean().nullable().optional(),
    is_qcp: z.boolean().nullable().optional(),
  })
  .strip();

export const CardResponseSchema = z
  .object({
    card: CardSchema,
  })
  .strip();

export const CardListResponseSchema = z
  .object({
    cards: z.array(CardSchema),
    meta: PaginationMetaSchema,
  })
  .strip();

/**
 * Appearance data for a specific card level.
 */
export const CardLevelAppearanceSchema = z
  .object({
    design: z.string(),
    assets: z.object({
      front_large: z.string(),
      front_small: z.string(),
      front_small_wallet: z.string(),
    }),
    theme: z.enum(["dark", "light"]),
    gradient_hex_color: z.string(),
    is_active: z.boolean(),
  })
  .strip();

/**
 * Card appearances grouped by card level.
 */
export const CardLevelAppearancesSchema = z
  .object({
    card_level: z.string(),
    appearances: z.array(CardLevelAppearanceSchema),
  })
  .strip();

/**
 * Card appearances grouped by card type.
 */
export const CardTypeAppearancesSchema = z
  .object({
    card_type: z.string(),
    card_level_appearances: z.array(CardLevelAppearancesSchema),
  })
  .strip();
