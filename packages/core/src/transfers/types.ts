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
  readonly attachment_ids?: readonly string[] | undefined;
  readonly vop_proof_token: string;
}

/**
 * All possible VoP match result values returned by the Qonto API.
 */
export type VopMatchResult =
  | "MATCH_RESULT_MATCH"
  | "MATCH_RESULT_CLOSE_MATCH"
  | "MATCH_RESULT_NO_MATCH"
  | "MATCH_RESULT_NOT_POSSIBLE"
  | "MATCH_RESULT_UNSPECIFIED";

/**
 * A single Verification of Payee (VoP) entry for requests.
 */
export interface VopEntry {
  readonly iban: string;
  readonly beneficiary_name: string;
}

/**
 * Verification of Payee (VoP) result returned by the Qonto API.
 */
export interface VopResult {
  readonly match_result: VopMatchResult;
  readonly matched_name: string | null;
  readonly proof_token: { readonly token: string };
}

/**
 * A single entry in a bulk VoP response, containing either a successful
 * response or an error for the given request ID.
 */
export interface BulkVopResultEntry {
  readonly id: string;
  readonly beneficiary_name: string;
  readonly iban: string;
  readonly response?:
    | {
        readonly match_result: VopMatchResult;
        readonly matched_name: string | null;
      }
    | undefined;
  readonly error?:
    | {
        readonly code: string;
        readonly detail?: string | undefined;
      }
    | undefined;
}

/**
 * Bulk Verification of Payee (VoP) result returned by the Qonto API.
 *
 * Contains per-entry responses/errors and a single batch-level proof token.
 */
export interface BulkVopResult {
  readonly responses: readonly BulkVopResultEntry[];
  readonly proof_token: { readonly token: string };
}
