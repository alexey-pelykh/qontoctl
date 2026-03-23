// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import { QontoApiError } from "../http-client.js";
import type { HttpClient, QueryParams } from "../http-client.js";
import { parseResponse } from "../response.js";
import {
  BulkVopResultResponseSchema,
  TransferListResponseSchema,
  TransferResponseSchema,
  VopResultResponseSchema,
} from "./schemas.js";
import type { CreateTransferParams, ListTransfersParams, Transfer, VopEntry, VopResult } from "./types.js";

/**
 * VoP error codes where the bank failed but Qonto still provides a
 * `proof_token` in `meta` that is valid for transfer creation.
 */
const VOP_BANK_ERROR_CODES: ReadonlySet<string> = new Set([
  "BAD_REQUEST_ERROR_RESPONDING_BANK_NOT_AVAILABLE",
  "BAD_REQUEST_ERROR_5XX_RESPONDING_BANK",
  "BAD_REQUEST_ERROR_RESPONDING_BANK_INVALID_RESPONSE",
  "INTERNAL_SERVER_ERROR_4XX_RESPONDING_BANK",
  "BAD_GATEWAY_ERROR_RESPONDING_BANK",
  "GATEWAY_TIMEOUT_ERROR_RESPONDING_BANK",
]);

/**
 * Extract the VoP proof token from a {@link QontoApiError} if the error
 * is a bank-related VoP failure that still carries a usable token.
 *
 * Returns the token string or `undefined` when not applicable.
 */
function extractVopProofToken(error: QontoApiError): string | undefined {
  for (const entry of error.errors) {
    if (!VOP_BANK_ERROR_CODES.has(entry.code)) continue;
    const meta = entry.meta;
    if (meta === undefined) continue;
    const proofToken = meta["proof_token"];
    if (typeof proofToken !== "object" || proofToken === null) continue;
    const token = (proofToken as Record<string, unknown>)["token"];
    if (typeof token === "string") return token;
  }
  return undefined;
}

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
 * List SEPA transfers with optional filtering and pagination.
 */
export async function listTransfers(
  client: HttpClient,
  params?: ListTransfersParams & { current_page?: number; per_page?: number },
): Promise<{ transfers: Transfer[]; meta: PaginationMeta }> {
  const query: Record<string, string | readonly string[]> = {};
  if (params) {
    Object.assign(query, buildTransferQueryParams(params));
    if (params.current_page !== undefined) query["current_page"] = String(params.current_page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/sepa/transfers";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(TransferListResponseSchema, response, endpointPath);
}

/**
 * Fetch a single SEPA transfer by ID.
 */
export async function getTransfer(client: HttpClient, id: string): Promise<Transfer> {
  const endpointPath = `/v2/sepa/transfers/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(TransferResponseSchema, response, endpointPath).transfer;
}

/**
 * Create a new SEPA transfer.
 */
export async function createTransfer(
  client: HttpClient,
  params: CreateTransferParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Transfer> {
  const endpointPath = "/v2/sepa/transfers";
  const response = await client.post(endpointPath, { transfer: params }, options);
  return parseResponse(TransferResponseSchema, response, endpointPath).transfer;
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
 *
 * When the responding bank fails but Qonto still provides a proof token
 * in the error body, this returns a `VopResult` with `result: "not_available"`
 * and the extracted token instead of throwing.
 */
export async function verifyPayee(
  client: HttpClient,
  params: VopEntry,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<VopResult> {
  const endpointPath = "/v2/sepa/verify_payee";
  try {
    const response = await client.post(endpointPath, params, options);
    return parseResponse(VopResultResponseSchema, response, endpointPath).verification;
  } catch (error: unknown) {
    if (error instanceof QontoApiError) {
      const token = extractVopProofToken(error);
      if (token !== undefined) {
        return {
          iban: params.iban,
          name: params.name,
          result: "not_available",
          vop_proof_token: token,
        };
      }
    }
    throw error;
  }
}

/**
 * Bulk verify payees (Verification of Payee / VoP).
 *
 * When the responding bank fails but Qonto still provides a proof token
 * in the error body, this returns `VopResult[]` entries with
 * `result: "not_available"` and the extracted token instead of throwing.
 */
export async function bulkVerifyPayee(
  client: HttpClient,
  entries: readonly VopEntry[],
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<readonly VopResult[]> {
  const endpointPath = "/v2/sepa/bulk_verify_payee";
  try {
    const response = await client.post(endpointPath, { entries }, options);
    return parseResponse(BulkVopResultResponseSchema, response, endpointPath).verifications;
  } catch (error: unknown) {
    if (error instanceof QontoApiError) {
      const token = extractVopProofToken(error);
      if (token !== undefined) {
        return entries.map((entry) => ({
          iban: entry.iban,
          name: entry.name,
          result: "not_available" as const,
          vop_proof_token: token,
        }));
      }
    }
    throw error;
  }
}
