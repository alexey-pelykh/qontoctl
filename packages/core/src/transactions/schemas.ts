// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { Transaction, TransactionLabel } from "./types.js";

/**
 * Schema for a label embedded within a transaction.
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
 */
export const TransactionSchema = z
  .object({
    id: z.string(),
    transaction_id: z.string(),
    amount: z.number(),
    amount_cents: z.number(),
    settled_balance: z.number().nullable(),
    settled_balance_cents: z.number().nullable(),
    local_amount: z.number(),
    local_amount_cents: z.number(),
    side: z.enum(["credit", "debit"]),
    operation_type: z.string(),
    currency: z.string(),
    local_currency: z.string(),
    label: z.string(),
    clean_counterparty_name: z.string(),
    settled_at: z.string().nullable(),
    emitted_at: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    status: z.enum(["pending", "declined", "completed"]),
    note: z.string().nullable(),
    reference: z.string().nullable(),
    vat_amount: z.number().nullable(),
    vat_amount_cents: z.number().nullable(),
    vat_rate: z.number().nullable(),
    initiator_id: z.string().nullable(),
    label_ids: z.array(z.string()).readonly(),
    attachment_ids: z.array(z.string()).readonly(),
    attachment_lost: z.boolean(),
    attachment_required: z.boolean(),
    card_last_digits: z.string().nullable(),
    category: z.string(),
    subject_type: z.string(),
    bank_account_id: z.string(),
    is_external_transaction: z.boolean(),
    attachments: z.array(z.unknown()).readonly().optional(),
    labels: z.array(TransactionLabelSchema).readonly().optional(),
    vat_details: z.unknown().optional(),
  })
  .strip() satisfies z.ZodType<Omit<Transaction, "attachments" | "labels" | "vat_details">>;
