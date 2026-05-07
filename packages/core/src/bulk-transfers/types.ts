// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Error details for a single transfer within a bulk transfer.
 */
export interface BulkTransferResultError {
  readonly code: string;
  readonly detail: string;
}

/**
 * Result for an individual transfer within a bulk transfer.
 */
export interface BulkTransferResult {
  readonly client_transfer_id: string;
  readonly transfer_id: string | null;
  readonly status: "pending" | "completed" | "failed";
  readonly errors: readonly BulkTransferResultError[] | null;
}

/**
 * An inline beneficiary for a single bulk-transfer item without a pre-existing
 * beneficiary record. Mirrors the single-transfer `InlineBeneficiary` shape but
 * is duplicated here to keep the bulk-transfers module self-contained.
 */
export interface BulkTransferInlineBeneficiary {
  readonly name: string;
  readonly iban: string;
  readonly bic?: string | undefined;
  readonly email?: string | undefined;
  readonly activity_tag?: string | undefined;
}

/**
 * A single transfer item within a bulk transfer creation request.
 *
 * Per the Qonto API, exactly one of `beneficiary_id` (existing beneficiary) or
 * `beneficiary` (inline) must be provided. `client_transfer_id` is required and
 * client-generated to correlate response results with input items. `amount` is
 * a decimal string (pattern `^\d+(\.\d{1,2})?$`).
 */
export interface BulkTransferItem {
  readonly client_transfer_id: string;
  readonly amount: string;
  readonly reference: string;
  readonly beneficiary_id?: string | undefined;
  readonly beneficiary?: BulkTransferInlineBeneficiary | undefined;
  readonly scheduled_date?: string | undefined;
  readonly note?: string | undefined;
  readonly attachment_ids?: readonly string[] | undefined;
}

/**
 * Parameters for creating a bulk transfer.
 *
 * Sent as the request body to `POST /v2/sepa/bulk_transfers`. The body shape is
 * flat (no top-level wrapper). `vop_proof_token` must come from a single
 * `bulk_verify_payee` call covering the exact set of IBANs in `bulk_transfers`.
 */
export interface CreateBulkTransferParams {
  readonly bank_account_id: string;
  readonly bulk_transfers: readonly BulkTransferItem[];
  readonly vop_proof_token: string;
}

/**
 * A bulk transfer as returned by the Qonto API.
 */
export interface BulkTransfer {
  readonly id: string;
  readonly initiator_id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly total_count: number;
  readonly completed_count: number;
  readonly pending_count: number;
  readonly failed_count: number;
  readonly results: readonly BulkTransferResult[];
}
