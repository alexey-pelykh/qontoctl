// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Parameters for creating a recurring transfer.
 *
 * `amount` is a decimal string (e.g. `"100.00"`); the Qonto API rejects
 * numeric amounts on `POST /v2/sepa/recurring_transfers` with
 * `not_a_string: amount must be a string`.
 *
 * `vop_proof_token` is required by the Qonto API: it must come from a
 * `verify_payee` call covering the beneficiary's IBAN/name. The token is
 * passed at the top level of the request body alongside the
 * `recurring_transfer` envelope (mirrors single-transfer's shape).
 */
export interface CreateRecurringTransferParams {
  readonly beneficiary_id: string;
  readonly bank_account_id: string;
  readonly amount: string;
  readonly currency: string;
  readonly reference: string;
  readonly note?: string | undefined;
  readonly first_execution_date: string;
  readonly frequency: "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";
  readonly vop_proof_token: string;
}

/**
 * A recurring transfer as returned by the Qonto API.
 *
 * `note` and `status` are typed as optional because the sandbox is observed to
 * omit them from `POST /v2/sepa/recurring_transfers` responses (the recurring
 * transfer is created successfully but the payload lacks these fields).
 *
 * `next_execution_date` is typed as nullable because the API returns `null`
 * after a successful cancel (`POST /v2/sepa/recurring_transfers/{id}/cancel`)
 * — the recurring transfer has no further executions scheduled.
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
  readonly note?: string | undefined;
  readonly first_execution_date: string;
  readonly last_execution_date: string | null;
  readonly next_execution_date: string | null;
  readonly frequency: "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";
  readonly status?: string | undefined;
  readonly created_at: string;
  readonly updated_at: string;
}
