// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { BulkTransferListResponseSchema, BulkTransferResponseSchema } from "./schemas.js";
import type { BulkTransfer, CreateBulkTransferParams } from "./types.js";

/**
 * Fetch a single bulk transfer by ID.
 */
export async function getBulkTransfer(client: HttpClient, id: string): Promise<BulkTransfer> {
  const endpointPath = `/v2/sepa/bulk_transfers/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(BulkTransferResponseSchema, response, endpointPath).bulk_transfer;
}

/**
 * Create a bulk transfer.
 */
export async function createBulkTransfer(
  client: HttpClient,
  params: CreateBulkTransferParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<BulkTransfer> {
  const endpointPath = "/v2/sepa/bulk_transfers";
  const response = await client.post(endpointPath, { bulk_transfer: params }, options);
  return parseResponse(BulkTransferResponseSchema, response, endpointPath).bulk_transfer;
}

/**
 * List bulk transfers with optional pagination.
 */
export async function listBulkTransfers(
  client: HttpClient,
  params?: { page?: number; per_page?: number },
): Promise<{ bulk_transfers: BulkTransfer[]; meta: PaginationMeta }> {
  const query: Record<string, string | readonly string[]> = {};
  if (params) {
    if (params.page !== undefined) query["page"] = String(params.page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/sepa/bulk_transfers";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(BulkTransferListResponseSchema, response, endpointPath);
}
