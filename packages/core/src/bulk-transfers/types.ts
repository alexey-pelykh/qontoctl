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
 * A single transfer item within a bulk transfer creation request.
 */
export interface BulkTransferItem {
  readonly beneficiary_id: string;
  readonly amount: number;
  readonly currency: string;
  readonly reference?: string | undefined;
}

/**
 * Parameters for creating a bulk transfer.
 */
export interface CreateBulkTransferParams {
  readonly transfers: readonly BulkTransferItem[];
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
