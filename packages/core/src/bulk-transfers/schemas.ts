// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { BulkTransfer, BulkTransferResult, BulkTransferResultError } from "./types.js";

/**
 * Schema for error details within a bulk transfer result.
 */
export const BulkTransferResultErrorSchema = z
  .object({
    code: z.string(),
    detail: z.string(),
  })
  .strip() satisfies z.ZodType<BulkTransferResultError>;

/**
 * Schema for an individual transfer result within a bulk transfer.
 */
export const BulkTransferResultSchema = z
  .object({
    client_transfer_id: z.string(),
    transfer_id: z.string().nullable(),
    status: z.enum(["pending", "completed", "failed"]),
    errors: z.array(BulkTransferResultErrorSchema).readonly().nullable(),
  })
  .strip() satisfies z.ZodType<BulkTransferResult>;

/**
 * Schema for a bulk transfer returned by the Qonto API.
 */
export const BulkTransferSchema = z
  .object({
    id: z.string(),
    initiator_id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    total_count: z.number(),
    completed_count: z.number(),
    pending_count: z.number(),
    failed_count: z.number(),
    results: z.array(BulkTransferResultSchema).readonly(),
  })
  .strip() satisfies z.ZodType<BulkTransfer>;

export const BulkTransferResponseSchema = z.object({
  bulk_transfer: BulkTransferSchema,
});

export const BulkTransferListResponseSchema = z.object({
  bulk_transfers: z.array(BulkTransferSchema),
  meta: PaginationMetaSchema,
});
