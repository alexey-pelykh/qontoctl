// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { Transaction, TransactionLabel } from "./types.js";

/**
 * Schema for a label embedded within a transaction.
 *
 * https://docs.qonto.com/api-reference/business-api/transactions-statements/transactions/list-transactions
 */
export const TransactionLabelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    parent_id: z.string().nullable(),
  })
  .strip() satisfies z.ZodType<TransactionLabel>;

/**
 * Schema for a transaction returned by the Qonto API.
 *
 * https://docs.qonto.com/api-reference/business-api/transactions-statements/transactions/retrieve-a-transaction
 * https://docs.qonto.com/api-reference/business-api/transactions-statements/transactions/list-transactions
 */
export const TransactionSchema = z
  .object({
    id: z.string(),
    transaction_id: z.string(),
    amount: z.number(),
    amount_cents: z.number(),
    settled_balance: z.number().nullable().optional().default(null),
    settled_balance_cents: z.number().nullable().optional().default(null),
    local_amount: z.number(),
    local_amount_cents: z.number(),
    side: z.enum(["credit", "debit"]),
    operation_type: z.string(),
    currency: z.string(),
    local_currency: z.string(),
    label: z.string(),
    clean_counterparty_name: z.string().nullable().optional().default(null),
    settled_at: z.string().nullable().optional().default(null),
    emitted_at: z.string(),
    created_at: z.string().nullable(),
    updated_at: z.string(),
    status: z.enum(["pending", "declined", "completed"]),
    note: z.string().nullable().optional().default(null),
    reference: z.string().nullable().optional().default(null),
    vat_amount: z.number().nullable().optional().default(null),
    vat_amount_cents: z.number().nullable().optional().default(null),
    vat_rate: z.number().nullable().optional().default(null),
    initiator_id: z.string().nullable().optional().default(null),
    label_ids: z.array(z.string()).readonly(),
    attachment_ids: z.array(z.string()).readonly(),
    attachment_lost: z.boolean(),
    attachment_required: z.boolean(),
    card_last_digits: z.string().nullable().optional().default(null),
    category: z.string(),
    subject_type: z.string(),
    bank_account_id: z.string(),
    is_external_transaction: z.boolean(),
    logo: z.object({ small: z.string().optional(), medium: z.string().optional() }).nullable().optional(),
    cashflow_category: z.object({ name: z.string().nullable() }).nullable().optional(),
    cashflow_subcategory: z.object({ name: z.string().nullable() }).nullable().optional(),
    transfer: z.record(z.string(), z.unknown()).nullable().optional(),
    income: z.record(z.string(), z.unknown()).nullable().optional(),
    swift_income: z.record(z.string(), z.unknown()).nullable().optional(),
    direct_debit: z.record(z.string(), z.unknown()).nullable().optional(),
    direct_debit_collection: z.record(z.string(), z.unknown()).nullable().optional(),
    check: z.record(z.string(), z.unknown()).nullable().optional(),
    financing_installment: z.record(z.string(), z.unknown()).nullable().optional(),
    pagopa_payment: z.record(z.string(), z.unknown()).nullable().optional(),
    direct_debit_hold: z.record(z.string(), z.unknown()).nullable().optional(),
    attachments: z.array(z.unknown()).readonly().optional(),
    labels: z.array(TransactionLabelSchema).readonly().optional(),
    vat_details: z.unknown().optional(),
  })
  .strip() satisfies z.ZodType<
  Omit<
    Transaction,
    | "logo"
    | "cashflow_category"
    | "cashflow_subcategory"
    | "transfer"
    | "income"
    | "swift_income"
    | "direct_debit"
    | "direct_debit_collection"
    | "check"
    | "financing_installment"
    | "pagopa_payment"
    | "direct_debit_hold"
    | "attachments"
    | "labels"
    | "vat_details"
  >
>;

export const TransactionResponseSchema = z
  .object({
    transaction: TransactionSchema,
  })
  .strip();

export const TransactionListResponseSchema = z
  .object({
    transactions: z.array(TransactionSchema),
    meta: PaginationMetaSchema,
  })
  .strip();
