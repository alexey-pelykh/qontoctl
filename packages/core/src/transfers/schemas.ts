// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { Transfer, VopResult } from "./types.js";

export const TransferSchema = z.object({
  id: z.string(),
  initiator_id: z.string(),
  bank_account_id: z.string(),
  beneficiary_id: z.string(),
  amount: z.number(),
  amount_cents: z.number(),
  amount_currency: z.string(),
  status: z.enum(["pending", "processing", "canceled", "declined", "settled"]),
  reference: z.string(),
  note: z.nullable(z.string()),
  scheduled_date: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  processed_at: z.nullable(z.string()),
  completed_at: z.nullable(z.string()),
  transaction_id: z.nullable(z.string()),
  recurring_transfer_id: z.nullable(z.string()),
  declined_reason: z.nullable(z.string()),
}) satisfies z.ZodType<Transfer>;

export const TransferResponseSchema = z.object({
  transfer: TransferSchema,
});

export const TransferListResponseSchema = z.object({
  transfers: z.array(TransferSchema),
  meta: PaginationMetaSchema,
});

export const VopResultSchema = z.object({
  iban: z.string(),
  name: z.string(),
  result: z.enum(["match", "mismatch", "not_available"]),
  vop_proof_token: z.string(),
}) satisfies z.ZodType<VopResult>;

export const VopResultResponseSchema = z.object({
  verification: VopResultSchema,
});

export const BulkVopResultResponseSchema = z.object({
  verifications: z.array(VopResultSchema),
});
