// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { InternalTransfer } from "./types.js";

export const InternalTransferSchema = z
  .object({
    id: z.string(),
    debit_iban: z.string(),
    credit_iban: z.string(),
    debit_bank_account_id: z.string(),
    credit_bank_account_id: z.string(),
    reference: z.string(),
    amount: z.number(),
    amount_cents: z.number(),
    currency: z.string(),
    status: z.string(),
    created_at: z.string(),
  })
  .strip() satisfies z.ZodType<InternalTransfer>;

export const InternalTransferResponseSchema = z
  .object({
    internal_transfer: InternalTransferSchema,
  })
  .strip();
