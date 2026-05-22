// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import type { SendQuoteRequestPayload } from "./types.js";

/**
 * Send a quote to the client via email.
 *
 * Issues `POST /v2/quotes/{id}/send` with the payload serialised as the
 * JSON request body. The HTTP client sets `Content-Type: application/json`
 * automatically because the request carries a body (see
 * `http-client.ts#buildHeaders`).
 *
 * The Qonto API requires `send_to` (non-empty per the endpoint contract,
 * though the OpenAPI shape itself does not declare a `minItems`) and
 * `email_title`; `copy_to_self` defaults to `true` server-side and
 * `email_body` is optional. Validation against
 * {@link SendQuoteRequestPayload} is the caller's responsibility — this
 * service intentionally passes the payload through verbatim to keep
 * request shaping at the call site (MCP tool / CLI command) where the
 * end-user-facing error surface lives.
 *
 * Reference: https://docs.qonto.com/api-reference/business-api/expense-management/client-quotes-notes/quotes/send-a-quote.md
 */
export async function sendQuote(client: HttpClient, id: string, payload: SendQuoteRequestPayload): Promise<void> {
  await client.requestVoid("POST", `/v2/quotes/${encodeURIComponent(id)}/send`, { body: payload });
}
