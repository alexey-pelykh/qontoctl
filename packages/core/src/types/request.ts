// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Common fields shared by all Qonto request types.
 */
interface RequestBase {
  readonly id: string;
  readonly status: "pending" | "approved" | "declined" | "canceled";
  readonly initiator_id: string;
  readonly approver_id: string | null;
  readonly note: string;
  readonly declined_note: string | null;
  readonly processed_at: string | null;
  readonly created_at: string;
}

/**
 * A flash card request.
 */
export interface RequestFlashCard extends RequestBase {
  readonly request_type: "flash_card";
  readonly payment_lifespan_limit: string;
  readonly pre_expires_at: string;
  readonly currency: string;
}

/**
 * A virtual card request.
 */
export interface RequestVirtualCard extends RequestBase {
  readonly request_type: "virtual_card";
  readonly payment_monthly_limit: string;
  readonly currency: string;
  readonly card_level: string;
  readonly card_design: string;
}

/**
 * A transfer request.
 */
export interface RequestTransfer extends RequestBase {
  readonly request_type: "transfer";
  readonly creditor_name: string;
  readonly amount: string;
  readonly currency: string;
  readonly scheduled_date: string;
  readonly recurrence: string;
  readonly last_recurrence_date: string | null;
  readonly attachment_ids: readonly string[];
}

/**
 * A multi-transfer request.
 */
export interface RequestMultiTransfer extends RequestBase {
  readonly request_type: "multi_transfer";
  readonly total_transfers_amount: string;
  readonly total_transfers_amount_currency: string;
  readonly total_transfers_count: number;
  readonly scheduled_date: string;
}

/**
 * A Qonto request — discriminated union of all request types.
 */
export type Request = RequestFlashCard | RequestVirtualCard | RequestTransfer | RequestMultiTransfer;
