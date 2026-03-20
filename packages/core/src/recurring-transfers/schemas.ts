// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { RecurringTransfer } from "./types.js";

/**
 * Schema for a recurring transfer returned by the Qonto API.
 */
export const RecurringTransferSchema = z
  .object({
    id: z.string(),
    initiator_id: z.string(),
    bank_account_id: z.string(),
    amount: z.number(),
    amount_cents: z.number(),
    amount_currency: z.string(),
    beneficiary_id: z.string(),
    reference: z.string(),
    note: z.string(),
    first_execution_date: z.string(),
    last_execution_date: z.string().nullable(),
    next_execution_date: z.string(),
    frequency: z.enum(["weekly", "monthly", "quarterly", "half_yearly", "yearly"]),
    status: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strip() satisfies z.ZodType<RecurringTransfer>;

export const RecurringTransferResponseSchema = z.object({
  recurring_transfer: RecurringTransferSchema,
});

export const RecurringTransferListResponseSchema = z.object({
  recurring_transfers: z.array(RecurringTransferSchema),
  meta: PaginationMetaSchema,
});
