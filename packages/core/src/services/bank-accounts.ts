// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { BankAccount, Organization } from "../api-types.js";
import { BankAccountSchema } from "../api-types.schema.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";

const BankAccountResponseSchema = z.object({ bank_account: BankAccountSchema });
const BankAccountListResponseSchema = z.object({
  bank_accounts: z.array(BankAccountSchema),
});

export interface CreateBankAccountParams {
  readonly name: string;
}

export interface UpdateBankAccountParams {
  readonly name?: string | undefined;
}

/**
 * Fetch a single bank account by ID.
 *
 * @param client - The HTTP client to use for the request.
 * @param id - The bank account UUID.
 * @returns The bank account details.
 */
export async function getBankAccount(client: HttpClient, id: string): Promise<BankAccount> {
  const endpointPath = `/v2/bank_accounts/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(BankAccountResponseSchema, response, endpointPath).bank_account;
}

/**
 * Download the IBAN certificate PDF for a bank account.
 *
 * @param client - The HTTP client to use for the request.
 * @param id - The bank account UUID.
 * @returns The IBAN certificate as a PDF buffer.
 */
export async function getIbanCertificate(client: HttpClient, id: string): Promise<Buffer> {
  return client.getBuffer(`/v2/bank_accounts/${encodeURIComponent(id)}/iban_certificate`);
}

/**
 * Create a new business bank account.
 *
 * @param client - The HTTP client to use for the request.
 * @param params - The bank account creation parameters.
 * @param options - Optional idempotency key and SCA session token.
 * @returns The created bank account details.
 */
export async function createBankAccount(
  client: HttpClient,
  params: CreateBankAccountParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<BankAccount> {
  const endpointPath = "/v2/bank_accounts";
  const response = await client.post(endpointPath, { bank_account: params }, options);
  return parseResponse(BankAccountResponseSchema, response, endpointPath).bank_account;
}

/**
 * Update an existing business bank account.
 *
 * @param client - The HTTP client to use for the request.
 * @param id - The bank account UUID.
 * @param params - The fields to update.
 * @param options - Optional idempotency key and SCA session token.
 * @returns The updated bank account details.
 */
export async function updateBankAccount(
  client: HttpClient,
  id: string,
  params: UpdateBankAccountParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<BankAccount> {
  const endpointPath = `/v2/bank_accounts/${encodeURIComponent(id)}`;
  const response = await client.request("PUT", endpointPath, {
    body: { bank_account: params },
    ...options,
  });
  return parseResponse(BankAccountResponseSchema, response, endpointPath).bank_account;
}

/**
 * List all bank accounts for the organization.
 *
 * @param client - The HTTP client to use for the request.
 * @param params - Optional pagination parameters.
 * @returns The bank accounts.
 */
export async function listBankAccounts(
  client: HttpClient,
  params?: { page?: number; per_page?: number },
): Promise<{ bank_accounts: BankAccount[] }> {
  const query: Record<string, string> = {};
  if (params?.page !== undefined) query["page"] = String(params.page);
  if (params?.per_page !== undefined) query["per_page"] = String(params.per_page);
  const endpointPath = "/v2/bank_accounts";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(BankAccountListResponseSchema, response, endpointPath);
}

/**
 * Close a business bank account.
 *
 * @param client - The HTTP client to use for the request.
 * @param id - The bank account UUID.
 * @param options - Optional idempotency key and SCA session token.
 */
export async function closeBankAccount(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  await client.requestVoid("POST", `/v2/bank_accounts/${encodeURIComponent(id)}/close`, options);
}

/**
 * Resolve the default bank account from an organization.
 *
 * Returns the account marked as `main`, or falls back to the first account.
 * Returns `undefined` if the organization has no bank accounts.
 */
export function resolveDefaultBankAccount(org: Organization): BankAccount | undefined {
  return org.bank_accounts.find((a) => a.main) ?? org.bank_accounts[0];
}
