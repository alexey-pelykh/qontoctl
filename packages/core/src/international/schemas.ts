// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { IntlCurrency, IntlEligibility, IntlQuote } from "./types.js";

export const IntlEligibilitySchema = z
  .object({
    eligible: z.boolean(),
    reason: z.string().optional(),
  })
  .loose() satisfies z.ZodType<IntlEligibility>;

export const IntlEligibilityResponseSchema = z.object({
  eligibility: IntlEligibilitySchema,
});

export const IntlCurrencySchema = z
  .object({
    code: z.string(),
    name: z.string(),
    min_amount: z.number().optional(),
    max_amount: z.number().optional(),
  })
  .loose() satisfies z.ZodType<IntlCurrency>;

export const IntlCurrencyListResponseSchema = z.object({
  currencies: z.array(IntlCurrencySchema),
});

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

export const IntlQuoteResponseSchema = z.object({
  quote: IntlQuoteSchema,
});
