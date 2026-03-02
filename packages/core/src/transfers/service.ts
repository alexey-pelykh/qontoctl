// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient, QueryParams } from "../http-client.js";
import type { CreateTransferParams, ListTransfersParams, Transfer, VopEntry, VopResult } from "./types.js";

/**
 * Build query parameter record from typed list parameters.
 *
 * Array parameters use the `key[]` convention expected by the Qonto API.
 */
export function buildTransferQueryParams(params: ListTransfersParams): QueryParams {
  const query: Record<string, string | readonly string[]> = {};

  if (params.status !== undefined && params.status.length > 0) {
    query["status[]"] = params.status;
  }
  if (params.updated_at_from !== undefined) {
    query["updated_at_from"] = params.updated_at_from;
  }
  if (params.updated_at_to !== undefined) {
    query["updated_at_to"] = params.updated_at_to;
  }
  if (params.scheduled_date_from !== undefined) {
    query["scheduled_date_from"] = params.scheduled_date_from;
  }
  if (params.scheduled_date_to !== undefined) {
    query["scheduled_date_to"] = params.scheduled_date_to;
  }
  if (params.beneficiary_ids !== undefined && params.beneficiary_ids.length > 0) {
    query["beneficiary_ids[]"] = params.beneficiary_ids;
  }
  if (params.ids !== undefined && params.ids.length > 0) {
    query["ids[]"] = params.ids;
  }
  if (params.recurring_transfer_ids !== undefined && params.recurring_transfer_ids.length > 0) {
    query["recurring_transfer_ids[]"] = params.recurring_transfer_ids;
  }
  if (params.sort_by !== undefined) {
    query["sort_by"] = params.sort_by;
  }

  return query;
}

/**
 * Fetch a single SEPA transfer by ID.
 */
export async function getTransfer(client: HttpClient, id: string): Promise<Transfer> {
  const response = await client.get<{ transfer: Transfer }>(`/v2/sepa/transfers/${encodeURIComponent(id)}`);
  return response.transfer;
}

/**
 * Create a new SEPA transfer.
 */
export async function createTransfer(
  client: HttpClient,
  params: CreateTransferParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Transfer> {
  const response = await client.post<{ transfer: Transfer }>("/v2/sepa/transfers", params, options);
  return response.transfer;
}

/**
 * Cancel a pending SEPA transfer.
 */
export async function cancelTransfer(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  await client.post("/v2/sepa/transfers/" + encodeURIComponent(id) + "/cancel", undefined, options);
}

/**
 * Download a SEPA transfer proof as a PDF buffer.
 */
export async function getTransferProof(client: HttpClient, id: string): Promise<Buffer> {
  return client.getBuffer(`/v2/sepa/transfers/${encodeURIComponent(id)}/proof`);
}

/**
 * Verify a single payee (Verification of Payee / VoP).
 */
export async function verifyPayee(
  client: HttpClient,
  params: VopEntry,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<VopResult> {
  const response = await client.post<{ verification: VopResult }>("/v2/sepa/verify_payee", params, options);
  return response.verification;
}

/**
 * Bulk verify payees (Verification of Payee / VoP).
 */
export async function bulkVerifyPayee(
  client: HttpClient,
  entries: readonly VopEntry[],
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<readonly VopResult[]> {
  const response = await client.post<{ verifications: readonly VopResult[] }>(
    "/v2/sepa/bulk_verify_payee",
    { entries },
    options,
  );
  return response.verifications;
}
