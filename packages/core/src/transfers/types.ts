// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A SEPA transfer returned by the Qonto API.
 */
export interface Transfer {
  readonly id: string;
  readonly initiator_id: string;
  readonly bank_account_id: string;
  readonly beneficiary_id: string;
  readonly amount: number;
  readonly amount_cents: number;
  readonly amount_currency: string;
  readonly status: "pending" | "processing" | "canceled" | "declined" | "settled";
  readonly reference: string;
  readonly note: string | null;
  readonly scheduled_date: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly processed_at: string | null;
  readonly completed_at: string | null;
  readonly transaction_id: string | null;
  readonly recurring_transfer_id: string | null;
  readonly declined_reason: string | null;
}

/**
 * Parameters for listing SEPA transfers.
 */
export interface ListTransfersParams {
  readonly status?: readonly string[];
  readonly updated_at_from?: string;
  readonly updated_at_to?: string;
  readonly scheduled_date_from?: string;
  readonly scheduled_date_to?: string;
  readonly beneficiary_ids?: readonly string[];
  readonly ids?: readonly string[];
  readonly recurring_transfer_ids?: readonly string[];
  readonly sort_by?: string;
}

/**
 * An inline beneficiary for creating a SEPA transfer without a pre-existing
 * beneficiary record.
 */
export interface InlineBeneficiary {
  readonly name: string;
  readonly iban: string;
  readonly bic?: string | undefined;
  readonly email?: string | undefined;
  readonly activity_tag?: string | undefined;
}

/**
 * Parameters for creating a SEPA transfer.
 *
 * Exactly one of `beneficiary_id` or `beneficiary` must be provided.
 */
export interface CreateTransferParams {
  readonly beneficiary_id?: string | undefined;
  readonly beneficiary?: InlineBeneficiary | undefined;
  readonly bank_account_id: string;
  readonly reference: string;
  readonly amount: string;
  readonly note?: string;
  readonly scheduled_date?: string;
  readonly vop_proof_token: string;
}

/**
 * A single Verification of Payee (VoP) entry for bulk requests.
 */
export interface VopEntry {
  readonly iban: string;
  readonly name: string;
}

/**
 * Verification of Payee (VoP) result returned by the Qonto API.
 */
export interface VopResult {
  readonly iban: string;
  readonly name: string;
  readonly result: "match" | "mismatch" | "not_available";
  readonly vop_proof_token: string;
}
