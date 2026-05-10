// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * An internal transfer returned by `POST /v2/internal_transfers`.
 *
 * Internal transfers move funds between bank accounts within the same Qonto
 * organization. The create response is slimmer than typical Qonto resources:
 * it does not echo the source/destination IBANs or bank-account IDs, and
 * the currency field is named `amount_currency` (verified empirically against
 * the production api-key endpoint, 2026-05-10).
 */
export interface InternalTransfer {
  readonly id: string;
  readonly slug: string;
  readonly reference: string;
  readonly amount: number;
  readonly amount_cents: number;
  readonly amount_currency: string;
  readonly status: string;
  readonly created_at: string;
}

/**
 * Parameters for creating an internal transfer.
 *
 * Note the request/response field-name asymmetry: the request body uses
 * `currency`, but the response (`InternalTransfer`) uses `amount_currency`.
 * This mirrors the actual Qonto API contract — do not conflate the two.
 */
export interface CreateInternalTransferParams {
  readonly debit_iban: string;
  readonly credit_iban: string;
  readonly reference: string;
  readonly amount: string;
  readonly currency: string;
}
