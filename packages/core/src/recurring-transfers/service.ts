// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { RecurringTransferListResponseSchema, RecurringTransferResponseSchema } from "./schemas.js";
import type { CreateRecurringTransferParams, RecurringTransfer } from "./types.js";

/**
 * Create a recurring transfer.
 */
export async function createRecurringTransfer(
  client: HttpClient,
  params: CreateRecurringTransferParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<RecurringTransfer> {
  const endpointPath = "/v2/sepa/recurring_transfers";
  const response = await client.post(endpointPath, { recurring_transfer: params }, options);
  return parseResponse(RecurringTransferResponseSchema, response, endpointPath).recurring_transfer;
}

/**
 * Cancel a recurring transfer.
 */
export async function cancelRecurringTransfer(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  await client.post("/v2/sepa/recurring_transfers/" + encodeURIComponent(id) + "/cancel", undefined, options);
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
