// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { z } from "zod";

import type { SendQuoteRequestPayloadSchema } from "./schemas.js";

/**
 * Payload for `POST /v2/quotes/{id}/send`.
 *
 * Inferred from {@link SendQuoteRequestPayloadSchema} via `z.infer`, so the
 * type reflects the schema's POST-PARSE shape. In particular, `copy_to_self`
 * carries the schema's `.default(true)` and is therefore required at the TS
 * layer even though the API treats it as optional with a documented server
 * default of `true`. Direct callers may pass `copy_to_self: true` explicitly
 * to mirror the documented default, or run the input through
 * `SendQuoteRequestPayloadSchema.parse(...)` to have the default materialised.
 *
 * Reference: https://docs.qonto.com/api-reference/business-api/expense-management/client-quotes-notes/quotes/send-a-quote.md
 */
export type SendQuoteRequestPayload = z.infer<typeof SendQuoteRequestPayloadSchema>;
