// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";

/**
 * Schema for a terminal-payment monetary amount.
 *
 * `value` is a decimal string per the Qonto API contract — see the
 * {@link TerminalAmount} type for the rationale. The schema does not enforce
 * the 0.10–100000.00 range; that validation lives at the input-parsing layer
 * (CLI/MCP) so the core schema accepts whatever the API echoes back without
 * re-validating server-trusted data.
 */
export const TerminalAmountSchema = z
  .object({
    value: z.string(),
    currency: z.literal("EUR"),
  })
  .strip();

/**
 * Schema for a Qonto Terminal as returned by `GET /v2/terminals`.
 */
export const TerminalSchema = z
  .object({
    id: z.string(),
    poi_id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strip();

/**
 * Schema for the `GET /v2/terminals` list response.
 */
export const TerminalListResponseSchema = z
  .object({
    terminals: z.array(TerminalSchema),
    meta: PaginationMetaSchema,
  })
  .strip();

/**
 * Schema for a terminal payment object.
 *
 * `metadata` may be absent (caller did not provide it) or an arbitrary
 * JSON object — modelled with `z.record(z.unknown())` so the schema
 * neither rejects nor flattens echo-back metadata.
 */
export const TerminalPaymentSchema = z
  .object({
    id: z.string(),
    terminal_id: z.string(),
    amount: TerminalAmountSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
    created_at: z.string(),
  })
  .strip();

/**
 * Schema for the `POST /v2/terminals/{id}/payment` response (202 Accepted).
 *
 * The API wraps the payment under `terminal_payment`.
 */
export const TerminalPaymentResponseSchema = z
  .object({
    terminal_payment: TerminalPaymentSchema,
  })
  .strip();
