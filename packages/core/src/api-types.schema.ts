// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { BankAccount, Organization, PaginationMeta } from "./api-types.js";

// https://docs.qonto.com/api-reference/business-api/accounts-organizations/organizations/retrieve-the-authenticated-organization-and-list-bank-accounts
// https://docs.qonto.com/api-reference/business-api/accounts-organizations/business-accounts/list
export const BankAccountSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    main: z.boolean(),
    organization_id: z.string().optional(),
    iban: z.string(),
    bic: z.string(),
    currency: z.string(),
    balance: z.coerce.number(),
    balance_cents: z.coerce.number(),
    authorized_balance: z.coerce.number(),
    authorized_balance_cents: z.coerce.number(),
    slug: z.string().optional(),
    is_external_account: z.boolean().optional(),
    account_number: z.string().nullable().optional(),
    updated_at: z.string().optional(),
  })
  .strip() satisfies z.ZodType<BankAccount>;

// https://docs.qonto.com/api-reference/business-api/accounts-organizations/organizations/retrieve-the-authenticated-organization-and-list-bank-accounts
//
// Additions for the post-#619/#624/#625/#626 contract-probe run against
// `/v2/organization` (sandbox 2026-05-20): 12 previously-undeclared fields the
// API consistently returns. All declared `.nullable().optional()` so the
// schema accepts production AND sandbox shapes without making over-strong type
// guarantees; the `address` field is permissive (`Record<string, unknown>`)
// because its sub-shape is undocumented and likely environment-specific.
export const OrganizationSchema = z
  .object({
    slug: z.string(),
    legal_name: z.string().nullable().optional(),
    bank_accounts: z.array(BankAccountSchema).readonly(),
    id: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    locale: z.string().nullable().optional(),
    legal_share_capital: z.number().nullable().optional(),
    legal_country: z.string().nullable().optional(),
    legal_registration_date: z.string().nullable().optional(),
    legal_form: z.string().nullable().optional(),
    legal_address: z.string().nullable().optional(),
    address: z.record(z.string(), z.unknown()).nullable().optional(),
    legal_sector: z.string().nullable().optional(),
    contract_signed_at: z.string().nullable().optional(),
    legal_number: z.string().nullable().optional(),
  })
  .strip() satisfies z.ZodType<Organization>;

export const PaginationMetaSchema = z
  .object({
    current_page: z.number(),
    next_page: z.number().nullable().optional(),
    prev_page: z.number().nullable().optional(),
    total_pages: z.number(),
    total_count: z.number(),
    per_page: z.number(),
  })
  .strip() satisfies z.ZodType<PaginationMeta>;
