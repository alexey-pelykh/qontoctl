// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { TerminalListResponseSchema, TerminalPaymentResponseSchema } from "./schemas.js";
import type { CreateTerminalPaymentParams, Terminal, TerminalPayment } from "./types.js";

/**
 * List physical Qonto Terminals (POS) linked to the authenticated organization.
 *
 * Required scope: `terminal.read`. Both api-key and OAuth bearer auth are
 * supported by the API.
 */
export async function listTerminals(
  client: HttpClient,
  params?: { page?: number; per_page?: number },
): Promise<{ terminals: readonly Terminal[]; meta: PaginationMeta }> {
  const query: Record<string, string> = {};
  if (params) {
    if (params.page !== undefined) query["page"] = String(params.page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/terminals";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(TerminalListResponseSchema, response, endpointPath);
}

/**
 * Initiate a payment on a specific terminal.
 *
 * Required scope: `terminal.write`. Returns `202 Accepted` — the terminal must
 * still physically accept the card. The HTTP client auto-generates an
 * `X-Qonto-Idempotency-Key` header when `options.idempotencyKey` is omitted;
 * callers retrying the same logical payment SHOULD pin the key explicitly so
 * the API can de-duplicate.
 *
 * The Qonto docs note that an offline terminal can hold the connection open
 * for up to ~120 seconds. Callers spawning the CLI/MCP from a short-timeout
 * harness should size their request budget accordingly.
 */
export async function createTerminalPayment(
  client: HttpClient,
  terminalId: string,
  params: CreateTerminalPaymentParams,
  options?: { readonly idempotencyKey?: string },
): Promise<TerminalPayment> {
  const endpointPath = `/v2/terminals/${encodeURIComponent(terminalId)}/payment`;
  const response = await client.post(endpointPath, params, options);
  return parseResponse(TerminalPaymentResponseSchema, response, endpointPath).terminal_payment;
}
