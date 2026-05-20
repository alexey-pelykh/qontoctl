// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A bank account as returned by the Qonto API.
 */
export interface BankAccount {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly main: boolean;
  readonly organization_id?: string | undefined;
  readonly iban: string;
  readonly bic: string;
  readonly currency: string;
  readonly balance: number;
  readonly balance_cents: number;
  readonly authorized_balance: number;
  readonly authorized_balance_cents: number;
  readonly slug?: string | undefined;
  readonly is_external_account?: boolean | undefined;
  readonly account_number?: string | null | undefined;
  readonly updated_at?: string | undefined;
}

/**
 * Organization details as returned by `GET /v2/organization`.
 *
 * Additions for the post-#619/#624/#625/#626 contract-probe run: 12
 * previously-undeclared API fields are declared as nullable+optional. The
 * `address` field's sub-shape is undocumented (varies by environment), so it
 * is typed as `Record<string, unknown>` (parser-permissive, caller-typed).
 */
export interface Organization {
  readonly slug: string;
  readonly legal_name?: string | null | undefined;
  readonly bank_accounts: readonly BankAccount[];
  readonly id?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly locale?: string | null | undefined;
  readonly legal_share_capital?: number | null | undefined;
  readonly legal_country?: string | null | undefined;
  readonly legal_registration_date?: string | null | undefined;
  readonly legal_form?: string | null | undefined;
  readonly legal_address?: string | null | undefined;
  readonly address?: Record<string, unknown> | null | undefined;
  readonly legal_sector?: string | null | undefined;
  readonly contract_signed_at?: string | null | undefined;
  readonly legal_number?: string | null | undefined;
}

/**
 * Pagination metadata returned by the Qonto API.
 *
 * `next_page` is optional because some endpoints (notably `/v2/cards`) omit
 * the field entirely on the final page rather than returning `null`.
 */
export interface PaginationMeta {
  readonly current_page: number;
  readonly next_page?: number | null | undefined;
  readonly prev_page?: number | null | undefined;
  readonly total_pages: number;
  readonly total_count: number;
  readonly per_page: number;
}
