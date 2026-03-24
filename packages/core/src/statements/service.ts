// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient, QueryParams } from "../http-client.js";
import { parseResponse } from "../response.js";
import { StatementListResponseSchema, StatementResponseSchema } from "./schemas.js";
import type { ListStatementsParams, Statement } from "./types.js";

/**
 * Build query parameter record from typed list parameters.
 *
 * Array parameters use the `key[]` convention expected by the Qonto API.
 */
export function buildStatementQueryParams(params: ListStatementsParams): QueryParams {
  const query: Record<string, string | readonly string[]> = {};

  if (params.bank_account_ids !== undefined && params.bank_account_ids.length > 0) {
    query["bank_account_ids[]"] = params.bank_account_ids;
  }
  if (params.period_from !== undefined) {
    query["period_from"] = params.period_from;
  }
  if (params.period_to !== undefined) {
    query["period_to"] = params.period_to;
  }
  if (params.sort_by !== undefined) {
    query["sort_by"] = params.sort_by;
  }

  return query;
}

/**
 * Fetch a single statement by ID.
 */
export async function getStatement(client: HttpClient, id: string): Promise<Statement> {
  const endpointPath = `/v2/statements/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(StatementResponseSchema, response, endpointPath).statement as Statement;
}

/**
 * List statements with optional filtering and pagination.
 */
export async function listStatements(
  client: HttpClient,
  params?: ListStatementsParams & { page?: number | undefined; per_page?: number | undefined },
): Promise<{ statements: Statement[]; meta: PaginationMeta }> {
  const query: Record<string, string | readonly string[]> = {};
  if (params) {
    Object.assign(query, buildStatementQueryParams(params));
    if (params.page !== undefined) query["page"] = String(params.page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/statements";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(StatementListResponseSchema, response, endpointPath) as {
    statements: Statement[];
    meta: PaginationMeta;
  };
}
