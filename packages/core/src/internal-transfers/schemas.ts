// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { InternalTransfer } from "./types.js";

/**
 * Schema for the internal-transfer object returned by `POST /v2/internal_transfers`.
 *
 * Empirical observation (2026-05-10, org `0909-future-club-2702`,
 * production api-key endpoint): the create response is slimmer than a typical
 * Qonto resource — it does NOT include IBANs or bank-account IDs, and the
 * currency field is named `amount_currency` rather than `currency`. This
 * schema models the actual API contract; previous versions of the schema
 * (with `debit_iban`, `credit_iban`, `debit_bank_account_id`,
 * `credit_bank_account_id`, `currency`) were aspirational and caused MCP
 * tool calls to fail with response-validation errors.
 */
export const InternalTransferSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    reference: z.string(),
    amount: z.number(),
    amount_cents: z.number(),
    amount_currency: z.string(),
    status: z.string(),
    created_at: z.string(),
  })
  .strip() satisfies z.ZodType<InternalTransfer>;

export const InternalTransferResponseSchema = z
  .object({
    internal_transfer: InternalTransferSchema,
  })
  .strip();
