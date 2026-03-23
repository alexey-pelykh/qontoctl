// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * An internal transfer returned by the Qonto API.
 *
 * Internal transfers move funds between bank accounts
 * within the same Qonto organization.
 */
export interface InternalTransfer {
  readonly id: string;
  readonly debit_iban: string;
  readonly credit_iban: string;
  readonly debit_bank_account_id: string;
  readonly credit_bank_account_id: string;
  readonly reference: string;
  readonly amount: number;
  readonly amount_cents: number;
  readonly currency: string;
  readonly status: string;
  readonly created_at: string;
}

/**
 * Parameters for creating an internal transfer.
 */
export interface CreateInternalTransferParams {
  readonly debit_iban: string;
  readonly credit_iban: string;
  readonly reference: string;
  readonly amount: string;
  readonly currency: string;
}
