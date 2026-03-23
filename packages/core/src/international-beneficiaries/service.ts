// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import {
  IntlBeneficiaryListResponseSchema,
  IntlBeneficiaryRequirementsResponseSchema,
  IntlBeneficiaryResponseSchema,
} from "./schemas.js";
import type {
  CreateIntlBeneficiaryParams,
  IntlBeneficiary,
  IntlBeneficiaryRequirements,
  UpdateIntlBeneficiaryParams,
} from "./types.js";

/**
 * List international beneficiaries with optional pagination.
 */
export async function listIntlBeneficiaries(
  client: HttpClient,
  params?: { page?: number; per_page?: number },
): Promise<{ international_beneficiaries: IntlBeneficiary[]; meta: PaginationMeta }> {
  const query: Record<string, string> = {};
  if (params?.page !== undefined) query["page"] = String(params.page);
  if (params?.per_page !== undefined) query["per_page"] = String(params.per_page);
  const endpointPath = "/v2/international/beneficiaries";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(IntlBeneficiaryListResponseSchema, response, endpointPath);
}

/**
 * Get required fields for creating an international beneficiary in a specific corridor.
 */
export async function getIntlBeneficiaryRequirements(
  client: HttpClient,
  id: string,
): Promise<IntlBeneficiaryRequirements> {
  const endpointPath = `/v2/international/beneficiaries/${encodeURIComponent(id)}/requirements`;
  const response = await client.get(endpointPath);
  return parseResponse(IntlBeneficiaryRequirementsResponseSchema, response, endpointPath).requirements;
}

/**
 * Create a new international beneficiary.
 */
export async function createIntlBeneficiary(
  client: HttpClient,
  params: CreateIntlBeneficiaryParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<IntlBeneficiary> {
  const endpointPath = "/v2/international/beneficiaries";
  const response = await client.post(endpointPath, { international_beneficiary: params }, options);
  return parseResponse(IntlBeneficiaryResponseSchema, response, endpointPath).international_beneficiary;
}

/**
 * Update an existing international beneficiary.
 */
export async function updateIntlBeneficiary(
  client: HttpClient,
  id: string,
  params: UpdateIntlBeneficiaryParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<IntlBeneficiary> {
  const endpointPath = `/v2/international/beneficiaries/${encodeURIComponent(id)}`;
  const response = await client.patch(endpointPath, { international_beneficiary: params }, options);
  return parseResponse(IntlBeneficiaryResponseSchema, response, endpointPath).international_beneficiary;
}

/**
 * Remove an international beneficiary.
 */
export async function removeIntlBeneficiary(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  await client.delete(`/v2/international/beneficiaries/${encodeURIComponent(id)}`, options);
}
