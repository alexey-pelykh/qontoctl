// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { RecurringTransfer } from "./types.js";

/**
 * Schema for a recurring transfer returned by the Qonto API.
 *
 * `status` and `note` are observed to be omitted from the sandbox response on
 * `POST /v2/sepa/recurring_transfers` (the recurring transfer is created
 * successfully but the payload lacks them); both are treated as optional.
 *
 * `last_execution_date` and `next_execution_date` are both in Qonto's
 * `required:` list for SepaRecurringTransfer, but their values are nullable
 * (e.g., `next_execution_date` is null after a successful cancel via
 * `POST /v2/sepa/recurring_transfers/{id}/cancel` — the recurring transfer
 * has no further executions scheduled). Field presence is guaranteed by the
 * contract, so we keep `.nullable()` (no `.optional()`) per L2 audit
 * (#604, R-SS-2).
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
    note: z.string().optional(),
    first_execution_date: z.string(),
    last_execution_date: z.string().nullable(),
    next_execution_date: z.string().nullable(),
    frequency: z.enum(["weekly", "monthly", "quarterly", "half_yearly", "yearly"]),
    status: z.string().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strip() satisfies z.ZodType<RecurringTransfer>;

export const RecurringTransferResponseSchema = z
  .object({
    recurring_transfer: RecurringTransferSchema,
  })
  .strip();

export const RecurringTransferListResponseSchema = z
  .object({
    recurring_transfers: z.array(RecurringTransferSchema),
    meta: PaginationMetaSchema,
  })
  .strip();
