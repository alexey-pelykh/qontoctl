// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { BulkVopResult, BulkVopResultEntry, Transfer, VopMatchResult, VopResult } from "./types.js";

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

export const VopMatchResultSchema = z.enum([
  "MATCH_RESULT_MATCH",
  "MATCH_RESULT_CLOSE_MATCH",
  "MATCH_RESULT_NO_MATCH",
  "MATCH_RESULT_NOT_POSSIBLE",
  "MATCH_RESULT_UNSPECIFIED",
]) satisfies z.ZodType<VopMatchResult>;

const ProofTokenSchema = z.object({
  token: z.string(),
});

export const VopResultSchema = z.object({
  match_result: VopMatchResultSchema,
  matched_name: z.nullable(z.string()).optional().default(null),
  proof_token: ProofTokenSchema,
}) satisfies z.ZodType<VopResult>;

export const VopResultResponseSchema = VopResultSchema;

export const BulkVopResultEntrySchema = z.object({
  id: z.string(),
  response: z
    .object({
      match_result: VopMatchResultSchema,
      matched_name: z.nullable(z.string()).optional().default(null),
    })
    .optional(),
  error: z
    .object({
      code: z.string(),
      detail: z.string(),
    })
    .optional(),
}) satisfies z.ZodType<BulkVopResultEntry>;

export const BulkVopResultResponseSchema = z.object({
  responses: z.array(BulkVopResultEntrySchema),
  proof_token: ProofTokenSchema,
}) satisfies z.ZodType<BulkVopResult>;
