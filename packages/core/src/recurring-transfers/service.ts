// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { RecurringTransferListResponseSchema, RecurringTransferResponseSchema } from "./schemas.js";
import type { CreateRecurringTransferParams, RecurringTransfer } from "./types.js";

/**
 * Create a recurring transfer.
 *
 * `vop_proof_token` is sent at the top level of the request body alongside
 * the `recurring_transfer` envelope, mirroring the single-transfer shape
 * (`POST /v2/sepa/transfers` accepts `{ vop_proof_token, transfer: {...} }`).
 */
export async function createRecurringTransfer(
  client: HttpClient,
  params: CreateRecurringTransferParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<RecurringTransfer> {
  const endpointPath = "/v2/sepa/recurring_transfers";
  const { vop_proof_token, ...recurringTransferFields } = params;
  const response = await client.post(
    endpointPath,
    { vop_proof_token, recurring_transfer: recurringTransferFields },
    options,
  );
  return parseResponse(RecurringTransferResponseSchema, response, endpointPath).recurring_transfer;
}

/**
 * Cancel a recurring transfer.
 *
 * The Qonto API returns `204 No Content` on success, so this uses
 * `requestVoid` rather than `client.post` (which would attempt to parse the
 * empty body as JSON and throw "Unexpected end of JSON input").
 */
export async function cancelRecurringTransfer(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  await client.requestVoid("POST", `/v2/sepa/recurring_transfers/${encodeURIComponent(id)}/cancel`, options);
}

/**
 * Fetch a single recurring transfer by ID.
 */
export async function getRecurringTransfer(client: HttpClient, id: string): Promise<RecurringTransfer> {
  const endpointPath = `/v2/sepa/recurring_transfers/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(RecurringTransferResponseSchema, response, endpointPath).recurring_transfer;
}

/**
 * List recurring transfers with optional pagination.
 */
export async function listRecurringTransfers(
  client: HttpClient,
  params?: { page?: number; per_page?: number },
): Promise<{ recurring_transfers: RecurringTransfer[]; meta: PaginationMeta }> {
  const query: Record<string, string | readonly string[]> = {};
  if (params) {
    if (params.page !== undefined) query["page"] = String(params.page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/sepa/recurring_transfers";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(RecurringTransferListResponseSchema, response, endpointPath);
}
