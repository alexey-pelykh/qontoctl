// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient, QueryParams } from "../http-client.js";
import { parseResponse } from "../response.js";
import type { Beneficiary } from "../types/beneficiary.js";
import { BeneficiaryListResponseSchema, BeneficiaryResponseSchema } from "./schemas.js";
import type { CreateBeneficiaryParams, ListBeneficiariesParams, UpdateBeneficiaryParams } from "./types.js";

/**
 * Build query parameter record from typed list parameters.
 *
 * Array parameters use the `key[]` convention expected by the Qonto API.
 */
export function buildBeneficiaryQueryParams(params: ListBeneficiariesParams): QueryParams {
  const query: Record<string, string | readonly string[]> = {};

  if (params.status !== undefined && params.status.length > 0) {
    query["status[]"] = params.status;
  }
  if (params.trusted !== undefined) {
    query["trusted"] = String(params.trusted);
  }
  if (params.iban !== undefined && params.iban.length > 0) {
    query["iban[]"] = params.iban;
  }
  if (params.updated_at_from !== undefined) {
    query["updated_at_from"] = params.updated_at_from;
  }
  if (params.updated_at_to !== undefined) {
    query["updated_at_to"] = params.updated_at_to;
  }
  if (params.sort_by !== undefined) {
    query["sort_by"] = params.sort_by;
  }

  return query;
}

/**
 * List SEPA beneficiaries with optional filtering and pagination.
 */
export async function listBeneficiaries(
  client: HttpClient,
  params?: ListBeneficiariesParams & { page?: number; per_page?: number },
): Promise<{ beneficiaries: Beneficiary[]; meta: PaginationMeta }> {
  const query: Record<string, string | readonly string[]> = {};
  if (params) {
    Object.assign(query, buildBeneficiaryQueryParams(params));
    if (params.page !== undefined) query["page"] = String(params.page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/sepa/beneficiaries";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(BeneficiaryListResponseSchema, response, endpointPath);
}

/**
 * Fetch a single SEPA beneficiary by ID.
 */
export async function getBeneficiary(client: HttpClient, id: string): Promise<Beneficiary> {
  const endpointPath = `/v2/sepa/beneficiaries/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(BeneficiaryResponseSchema, response, endpointPath).beneficiary;
}

/**
 * Create a new SEPA beneficiary.
 */
export async function createBeneficiary(
  client: HttpClient,
  params: CreateBeneficiaryParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Beneficiary> {
  const endpointPath = "/v2/sepa/beneficiaries";
  const response = await client.post(endpointPath, { beneficiary: params }, options);
  return parseResponse(BeneficiaryResponseSchema, response, endpointPath).beneficiary;
}

/**
 * Update an existing SEPA beneficiary.
 */
export async function updateBeneficiary(
  client: HttpClient,
  id: string,
  params: UpdateBeneficiaryParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<Beneficiary> {
  const endpointPath = `/v2/sepa/beneficiaries/${encodeURIComponent(id)}`;
  const response = await client.put(endpointPath, { beneficiary: params }, options);
  return parseResponse(BeneficiaryResponseSchema, response, endpointPath).beneficiary;
}

/**
 * Trust one or more SEPA beneficiaries.
 *
 * Note: this endpoint requires the `beneficiary.trust` OAuth scope, which is
 * Embed-partner-only on Qonto. Standard third-party OAuth apps and API-key
 * tenants do not have it and will receive 403 from the API.
 */
export async function trustBeneficiaries(
  client: HttpClient,
  ids: string[],
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  await client.patch("/v2/sepa/beneficiaries/trust", { ids }, options);
}

/**
 * Untrust one or more SEPA beneficiaries.
 *
 * Note: this endpoint requires the `beneficiary.trust` OAuth scope, which is
 * Embed-partner-only on Qonto. Standard third-party OAuth apps and API-key
 * tenants do not have it and will receive 403 from the API.
 */
export async function untrustBeneficiaries(
  client: HttpClient,
  ids: string[],
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  await client.patch("/v2/sepa/beneficiaries/untrust", { ids }, options);
}
