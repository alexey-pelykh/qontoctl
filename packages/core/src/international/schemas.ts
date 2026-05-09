// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { IntlCurrency, IntlEligibility, IntlQuote } from "./types.js";

// International API schemas use .loose() to pass through unknown fields.
// These endpoints are less stable and may return additional undocumented properties.

/**
 * Schema for the eligibility object — and for the
 * `GET /v2/international/eligibility` response, which returns the eligibility
 * flat (no `eligibility` wrapper).
 */
export const IntlEligibilitySchema = z
  .object({
    status: z.string(),
    reason: z.string().optional(),
  })
  .loose() satisfies z.ZodType<IntlEligibility>;

export const IntlCurrencySchema = z
  .object({
    country_code: z.string(),
    currency_code: z.string(),
    suggestion_priority: z.number().optional(),
  })
  .loose() satisfies z.ZodType<IntlCurrency>;

export const IntlCurrencyListResponseSchema = z
  .object({
    currencies: z.array(IntlCurrencySchema),
  })
  .strip();

export const IntlQuoteSchema = z
  .object({
    id: z.string(),
    source_currency: z.string(),
    target_currency: z.string(),
    source_amount: z.number(),
    target_amount: z.number(),
    rate: z.number(),
    fee_amount: z.number(),
    fee_currency: z.string(),
    expires_at: z.string(),
  })
  .loose() satisfies z.ZodType<IntlQuote>;

export const IntlQuoteResponseSchema = z
  .object({
    quote: IntlQuoteSchema,
  })
  .strip();
