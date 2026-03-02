// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * The request type discriminant values used in the Qonto API.
 */
export type RequestType = "flash_card" | "virtual_card" | "transfer" | "multi_transfer";

/**
 * Parameters for approving a request.
 */
export interface ApproveRequestParams {
  readonly debit_iban?: string | undefined;
}

/**
 * Parameters for declining a request.
 */
export interface DeclineRequestParams {
  readonly declined_note: string;
}

/**
 * Parameters for creating a flash card request.
 */
export interface CreateFlashCardRequestParams {
  readonly note?: string | undefined;
  readonly payment_lifespan_limit?: string | undefined;
  readonly pre_expires_at?: string | undefined;
}

/**
 * Parameters for creating a virtual card request.
 */
export interface CreateVirtualCardRequestParams {
  readonly note?: string | undefined;
  readonly payment_monthly_limit?: string | undefined;
  readonly card_level?: string | undefined;
  readonly card_design?: string | undefined;
}

/**
 * A single transfer entry within a multi-transfer request.
 */
export interface MultiTransferItem {
  readonly amount: string;
  readonly currency: string;
  readonly credit_iban: string;
  readonly credit_account_name: string;
  readonly credit_account_currency: string;
  readonly reference: string;
  readonly attachment_ids?: readonly string[] | undefined;
}

/**
 * Parameters for creating a multi-transfer request.
 */
export interface CreateMultiTransferRequestParams {
  readonly note: string;
  readonly transfers: readonly MultiTransferItem[];
  readonly scheduled_date?: string | undefined;
  readonly debit_iban?: string | undefined;
}
