// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient, QueryParams } from "../http-client.js";
import { parseResponse } from "../response.js";
import type { Beneficiary } from "../types/beneficiary.js";
import { BeneficiaryResponseSchema } from "./schemas.js";
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
  const response = await client.post(endpointPath, params, options);
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
  const response = await client.put(endpointPath, params, options);
  return parseResponse(BeneficiaryResponseSchema, response, endpointPath).beneficiary;
}

/**
 * Trust one or more SEPA beneficiaries.
 */
export async function trustBeneficiaries(
  client: HttpClient,
  ids: string[],
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  await client.post("/v2/sepa/beneficiaries/trust", { ids }, options);
}

/**
 * Untrust one or more SEPA beneficiaries.
 */
export async function untrustBeneficiaries(
  client: HttpClient,
  ids: string[],
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  await client.post("/v2/sepa/beneficiaries/untrust", { ids }, options);
}
