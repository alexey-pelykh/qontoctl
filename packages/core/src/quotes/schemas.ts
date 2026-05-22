// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

/**
 * Zod schema for the `POST /v2/quotes/{id}/send` request body.
 *
 * Mirrors the Qonto OpenAPI `SendQuoteRequestPayload` shape exactly:
 *
 * ```yaml
 * SendQuoteRequestPayload:
 *   type: object
 *   required: [send_to, email_title]
 *   properties:
 *     send_to:      { type: array, items: { type: string, format: email } }
 *     copy_to_self: { type: boolean, default: true }
 *     email_title:  { type: string }
 *     email_body:   { type: string }
 * ```
 *
 * `copy_to_self` applies the documented server-side default on parse so
 * consumers may omit it. No additional client-side validation (e.g.
 * non-empty `send_to`, non-empty `email_title`) is layered here — those
 * constraints belong to the MCP-tool / CLI-command boundaries that wrap
 * this schema (see #638, #639).
 *
 * Unknown fields are stripped on parse to keep request bodies minimal.
 *
 * Reference: https://docs.qonto.com/api-reference/business-api/expense-management/client-quotes-notes/quotes/send-a-quote.md
 */
export const SendQuoteRequestPayloadSchema = z
  .object({
    send_to: z.array(z.email()),
    copy_to_self: z.boolean().default(true),
    email_title: z.string(),
    email_body: z.string().optional(),
  })
  .strip();
