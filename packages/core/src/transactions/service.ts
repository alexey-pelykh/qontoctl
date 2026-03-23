// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient, QueryParams } from "../http-client.js";
import { parseResponse } from "../response.js";
import { TransactionListResponseSchema, TransactionResponseSchema } from "./schemas.js";
import type { ListTransactionsParams, Transaction } from "./types.js";

/**
 * Build query parameter record from typed list parameters.
 *
 * Array parameters use the `key[]` convention expected by the Qonto API.
 */
export function buildTransactionQueryParams(params: ListTransactionsParams): QueryParams {
  const query: Record<string, string | readonly string[]> = {};

  if (params.bank_account_id !== undefined) {
    query["bank_account_id"] = params.bank_account_id;
  }
  if (params.iban !== undefined) {
    query["iban"] = params.iban;
  }
  if (params.status !== undefined && params.status.length > 0) {
    query["status[]"] = params.status;
  }
  if (params.side !== undefined) {
    query["side"] = params.side;
  }
  if (params.operation_type !== undefined && params.operation_type.length > 0) {
    query["operation_type[]"] = params.operation_type;
  }
  if (params.settled_at_from !== undefined) {
    query["settled_at_from"] = params.settled_at_from;
  }
  if (params.settled_at_to !== undefined) {
    query["settled_at_to"] = params.settled_at_to;
  }
  if (params.emitted_at_from !== undefined) {
    query["emitted_at_from"] = params.emitted_at_from;
  }
  if (params.emitted_at_to !== undefined) {
    query["emitted_at_to"] = params.emitted_at_to;
  }
  if (params.updated_at_from !== undefined) {
    query["updated_at_from"] = params.updated_at_from;
  }
  if (params.updated_at_to !== undefined) {
    query["updated_at_to"] = params.updated_at_to;
  }
  if (params.with_attachments !== undefined) {
    query["with_attachments"] = String(params.with_attachments);
  }
  if (params.includes !== undefined && params.includes.length > 0) {
    query["includes[]"] = params.includes;
  }
  if (params.sort_by !== undefined) {
    query["sort_by"] = params.sort_by;
  }

  return query;
}

/**
 * Fetch a single transaction by ID.
 */
export async function getTransaction(
  client: HttpClient,
  id: string,
  includes?: readonly string[],
): Promise<Transaction> {
  const params: Record<string, string | readonly string[]> = {};
  if (includes !== undefined && includes.length > 0) {
    params["includes[]"] = includes;
  }

  const endpointPath = `/v2/transactions/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath, Object.keys(params).length > 0 ? params : undefined);
  return parseResponse(TransactionResponseSchema, response, endpointPath).transaction as Transaction;
}

/**
 * List transactions with optional filtering and pagination.
 */
export async function listTransactions(
  client: HttpClient,
  params?: ListTransactionsParams & { page?: number; per_page?: number },
): Promise<{ transactions: Transaction[]; meta: PaginationMeta }> {
  const query: Record<string, string | readonly string[]> = {};
  if (params) {
    Object.assign(query, buildTransactionQueryParams(params));
    if (params.page !== undefined) query["page"] = String(params.page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/transactions";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(TransactionListResponseSchema, response, endpointPath) as {
    transactions: Transaction[];
    meta: PaginationMeta;
  };
}
