// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { InsuranceContractResponseSchema, InsuranceDocumentResponseSchema } from "./schemas.js";
import type {
  InsuranceContract,
  InsuranceContractOrigin,
  InsuranceContractPaymentFrequency,
  InsuranceContractPrice,
  InsuranceContractStatus,
  InsuranceDocument,
} from "./types.js";

/**
 * Parameters for creating a new insurance contract.
 *
 * Per the Qonto API docs, `name`, `contract_id`, `origin`, `provider_slug`,
 * `type`, and `status` are required. The Qonto sandbox additionally rejects
 * requests missing `payment_frequency` or `price` with HTTP 400, so this
 * type marks them required as well.
 */
export interface CreateInsuranceContractParams {
  readonly name: string;
  readonly contract_id: string;
  readonly origin: InsuranceContractOrigin;
  readonly provider_slug: string;
  readonly type: string;
  readonly status: InsuranceContractStatus;
  readonly payment_frequency: InsuranceContractPaymentFrequency;
  readonly price: InsuranceContractPrice;
  readonly start_date?: string | undefined;
  readonly expiration_date?: string | undefined;
  readonly renewal_date?: string | undefined;
  readonly service_url?: string | undefined;
  readonly troubleshooting_url?: string | undefined;
}

/**
 * Parameters for updating an existing insurance contract.
 *
 * All fields are optional per the Qonto API docs.
 */
export interface UpdateInsuranceContractParams {
  readonly name?: string | undefined;
  readonly contract_id?: string | undefined;
  readonly origin?: InsuranceContractOrigin | undefined;
  readonly provider_slug?: string | undefined;
  readonly type?: string | undefined;
  readonly status?: InsuranceContractStatus | undefined;
  readonly payment_frequency?: InsuranceContractPaymentFrequency | undefined;
  readonly price?: InsuranceContractPrice | undefined;
  readonly start_date?: string | undefined;
  readonly expiration_date?: string | undefined;
  readonly renewal_date?: string | undefined;
  readonly service_url?: string | undefined;
  readonly troubleshooting_url?: string | undefined;
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
  const response = await client.patch(endpointPath, { insurance_contract: params }, options);
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
