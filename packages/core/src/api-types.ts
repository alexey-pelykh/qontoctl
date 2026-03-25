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
 */
export interface Organization {
  readonly slug: string;
  readonly legal_name: string | null;
  readonly bank_accounts: readonly BankAccount[];
}

/**
 * Pagination metadata returned by the Qonto API.
 */
export interface PaginationMeta {
  readonly current_page: number;
  readonly next_page: number | null;
  readonly prev_page?: number | null | undefined;
  readonly total_pages: number;
  readonly total_count: number;
  readonly per_page: number;
}
