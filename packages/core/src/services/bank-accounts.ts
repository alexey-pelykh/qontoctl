// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { BankAccount, Organization } from "../api-types.js";
import type { HttpClient } from "../http-client.js";

interface BankAccountResponse {
  readonly bank_account: BankAccount;
}

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
  const response = await client.get<BankAccountResponse>(`/v2/bank_accounts/${encodeURIComponent(id)}`);
  return response.bank_account;
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
  const response = await client.post<BankAccountResponse>("/v2/bank_accounts", { bank_account: params }, options);
  return response.bank_account;
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
  const response = await client.request<BankAccountResponse>("PUT", `/v2/bank_accounts/${encodeURIComponent(id)}`, {
    body: { bank_account: params },
    ...options,
  });
  return response.bank_account;
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
