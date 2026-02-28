// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { BankAccount, Organization } from "../api-types.js";
import type { HttpClient } from "../http-client.js";

interface BankAccountResponse {
  readonly bank_account: BankAccount;
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
 * Resolve the default bank account from an organization.
 *
 * Returns the account marked as `main`, or falls back to the first account.
 * Returns `undefined` if the organization has no bank accounts.
 */
export function resolveDefaultBankAccount(org: Organization): BankAccount | undefined {
  return org.bank_accounts.find((a) => a.main) ?? org.bank_accounts[0];
}
