// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { InsuranceContractResponseSchema, InsuranceDocumentResponseSchema } from "./schemas.js";
import type { InsuranceContract, InsuranceDocument } from "./types.js";

export interface CreateInsuranceContractParams {
  readonly insurance_type: string;
  readonly provider_name: string;
  readonly contract_number?: string | undefined;
  readonly start_date: string;
  readonly end_date?: string | undefined;
}

export interface UpdateInsuranceContractParams {
  readonly insurance_type?: string | undefined;
  readonly provider_name?: string | undefined;
  readonly contract_number?: string | undefined;
  readonly start_date?: string | undefined;
  readonly end_date?: string | undefined;
}

/**
 * Fetch an insurance contract by ID.
 *
 * @param client - The HTTP client to use for the request.
 * @param id - The insurance contract UUID.
 * @returns The insurance contract details.
 */
export async function getInsuranceContract(client: HttpClient, id: string): Promise<InsuranceContract> {
  const endpointPath = `/v2/insurance_contracts/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(InsuranceContractResponseSchema, response, endpointPath).insurance_contract;
}

/**
 * Create a new insurance contract.
 *
 * @param client - The HTTP client to use for the request.
 * @param params - The insurance contract creation parameters.
 * @param options - Optional idempotency key and SCA session token.
 * @returns The created insurance contract.
 */
export async function createInsuranceContract(
  client: HttpClient,
  params: CreateInsuranceContractParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<InsuranceContract> {
  const endpointPath = "/v2/insurance_contracts";
  const response = await client.post(endpointPath, { insurance_contract: params }, options);
  return parseResponse(InsuranceContractResponseSchema, response, endpointPath).insurance_contract;
}

/**
 * Update an existing insurance contract.
 *
 * @param client - The HTTP client to use for the request.
 * @param id - The insurance contract UUID.
 * @param params - The fields to update.
 * @param options - Optional idempotency key and SCA session token.
 * @returns The updated insurance contract.
 */
export async function updateInsuranceContract(
  client: HttpClient,
  id: string,
  params: UpdateInsuranceContractParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<InsuranceContract> {
  const endpointPath = `/v2/insurance_contracts/${encodeURIComponent(id)}`;
  const response = await client.put(endpointPath, { insurance_contract: params }, options);
  return parseResponse(InsuranceContractResponseSchema, response, endpointPath).insurance_contract;
}

/**
 * Upload a document to an insurance contract via multipart form-data.
 *
 * @param client - The HTTP client to use for the request.
 * @param contractId - The insurance contract UUID.
 * @param file - The file content as a Blob.
 * @param fileName - The file name.
 * @param options - Optional idempotency key.
 * @returns The uploaded document details.
 */
export async function uploadInsuranceDocument(
  client: HttpClient,
  contractId: string,
  file: Blob,
  fileName: string,
  options?: { readonly idempotencyKey?: string },
): Promise<InsuranceDocument> {
  const formData = new FormData();
  formData.append("file", file, fileName);

  const endpointPath = `/v2/insurance_contracts/${encodeURIComponent(contractId)}/documents`;
  const response = await client.postFormData(endpointPath, formData, options);
  return parseResponse(InsuranceDocumentResponseSchema, response, endpointPath).insurance_document;
}

/**
 * Remove a document from an insurance contract.
 *
 * @param client - The HTTP client to use for the request.
 * @param contractId - The insurance contract UUID.
 * @param documentId - The document UUID.
 * @param options - Optional idempotency key.
 */
export async function removeInsuranceDocument(
  client: HttpClient,
  contractId: string,
  documentId: string,
  options?: { readonly idempotencyKey?: string },
): Promise<void> {
  await client.delete(
    `/v2/insurance_contracts/${encodeURIComponent(contractId)}/documents/${encodeURIComponent(documentId)}`,
    options,
  );
}
