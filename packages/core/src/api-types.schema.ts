// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { BankAccount, Organization, PaginationMeta } from "./api-types.js";

export const BankAccountSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    main: z.boolean(),
    organization_id: z.string(),
    iban: z.string(),
    bic: z.string(),
    currency: z.string(),
    balance: z.number(),
    balance_cents: z.number(),
    authorized_balance: z.number(),
    authorized_balance_cents: z.number(),
    slug: z.string(),
  })
  .strip() satisfies z.ZodType<BankAccount>;

export const OrganizationSchema = z
  .object({
    slug: z.string(),
    legal_name: z.string(),
    bank_accounts: z.array(BankAccountSchema).readonly(),
  })
  .strip() satisfies z.ZodType<Organization>;

export const PaginationMetaSchema = z
  .object({
    current_page: z.number(),
    next_page: z.number().nullable(),
    prev_page: z.number().nullable(),
    total_pages: z.number(),
    total_count: z.number(),
    per_page: z.number(),
  })
  .strip() satisfies z.ZodType<PaginationMeta>;
