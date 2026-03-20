// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type {
  Request,
  RequestFlashCard,
  RequestMultiTransfer,
  RequestTransfer,
  RequestVirtualCard,
} from "./request.js";

const RequestBaseSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "approved", "declined", "canceled"]),
  initiator_id: z.string(),
  approver_id: z.string().nullable(),
  note: z.string(),
  declined_note: z.string().nullable(),
  processed_at: z.string().nullable(),
  created_at: z.string(),
});

export const RequestFlashCardSchema = RequestBaseSchema.extend({
  request_type: z.literal("flash_card"),
  payment_lifespan_limit: z.string(),
  pre_expires_at: z.string(),
  currency: z.string(),
}) satisfies z.ZodType<RequestFlashCard>;

export const RequestVirtualCardSchema = RequestBaseSchema.extend({
  request_type: z.literal("virtual_card"),
  payment_monthly_limit: z.string(),
  currency: z.string(),
  card_level: z.string(),
  card_design: z.string(),
}) satisfies z.ZodType<RequestVirtualCard>;

export const RequestTransferSchema = RequestBaseSchema.extend({
  request_type: z.literal("transfer"),
  creditor_name: z.string(),
  amount: z.string(),
  currency: z.string(),
  scheduled_date: z.string(),
  recurrence: z.string(),
  last_recurrence_date: z.string().nullable(),
  attachment_ids: z.array(z.string()),
}) satisfies z.ZodType<RequestTransfer>;

export const RequestMultiTransferSchema = RequestBaseSchema.extend({
  request_type: z.literal("multi_transfer"),
  total_transfers_amount: z.string(),
  total_transfers_amount_currency: z.string(),
  total_transfers_count: z.number(),
  scheduled_date: z.string(),
}) satisfies z.ZodType<RequestMultiTransfer>;

export const RequestSchema = z.discriminatedUnion("request_type", [
  RequestFlashCardSchema,
  RequestVirtualCardSchema,
  RequestTransferSchema,
  RequestMultiTransferSchema,
]) satisfies z.ZodType<Request>;
