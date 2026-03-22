// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A transaction returned by the Qonto API.
 */
export interface Transaction {
  readonly id: string;
  readonly transaction_id: string;
  readonly amount: number;
  readonly amount_cents: number;
  readonly settled_balance: number | null;
  readonly settled_balance_cents: number | null;
  readonly local_amount: number;
  readonly local_amount_cents: number;
  readonly side: "credit" | "debit";
  readonly operation_type: string;
  readonly currency: string;
  readonly local_currency: string;
  readonly label: string;
  readonly clean_counterparty_name: string | null;
  readonly settled_at: string | null;
  readonly emitted_at: string;
  readonly created_at: string | null;
  readonly updated_at: string;
  readonly status: "pending" | "declined" | "completed";
  readonly note: string | null;
  readonly reference: string | null;
  readonly vat_amount: number | null;
  readonly vat_amount_cents: number | null;
  readonly vat_rate: number | null;
  readonly initiator_id: string | null;
  readonly label_ids: readonly string[];
  readonly attachment_ids: readonly string[];
  readonly attachment_lost: boolean;
  readonly attachment_required: boolean;
  readonly card_last_digits: string | null;
  readonly category: string;
  readonly subject_type: string;
  readonly bank_account_id: string;
  readonly is_external_transaction: boolean;
  readonly attachments?: readonly unknown[];
  readonly labels?: readonly TransactionLabel[];
  readonly vat_details?: unknown;
}

/**
 * A label embedded within a transaction when using `includes[]=labels`.
 */
export interface TransactionLabel {
  readonly id: string;
  readonly name: string;
  readonly parent_id: string | null;
}

/**
 * Parameters for listing transactions.
 */
export interface ListTransactionsParams {
  readonly bank_account_id?: string;
  readonly iban?: string;
  readonly status?: readonly string[];
  readonly side?: string;
  readonly operation_type?: readonly string[];
  readonly settled_at_from?: string;
  readonly settled_at_to?: string;
  readonly emitted_at_from?: string;
  readonly emitted_at_to?: string;
  readonly updated_at_from?: string;
  readonly updated_at_to?: string;
  readonly with_attachments?: boolean;
  readonly includes?: readonly string[];
  readonly sort_by?: string;
}
