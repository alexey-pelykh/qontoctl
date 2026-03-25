// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Parameters for creating a recurring transfer.
 */
export interface CreateRecurringTransferParams {
  readonly beneficiary_id: string;
  readonly bank_account_id: string;
  readonly amount: number;
  readonly currency: string;
  readonly reference: string;
  readonly note?: string | undefined;
  readonly first_execution_date: string;
  readonly frequency: "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";
}

/**
 * A recurring transfer as returned by the Qonto API.
 */
export interface RecurringTransfer {
  readonly id: string;
  readonly initiator_id: string;
  readonly bank_account_id: string;
  readonly amount: number;
  readonly amount_cents: number;
  readonly amount_currency: string;
  readonly beneficiary_id: string;
  readonly reference: string;
  readonly note: string;
  readonly first_execution_date: string;
  readonly last_execution_date: string | null;
  readonly next_execution_date: string;
  readonly frequency: "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}
