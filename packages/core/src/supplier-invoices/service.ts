// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient, QueryParams } from "../http-client.js";
import { parseResponse } from "../response.js";
import {
  BulkCreateSupplierInvoicesResultSchema,
  SupplierInvoiceListResponseSchema,
  SupplierInvoiceResponseSchema,
} from "./schemas.js";
import type {
  BulkCreateSupplierInvoiceEntry,
  BulkCreateSupplierInvoicesResult,
  ListSupplierInvoicesParams,
  SupplierInvoice,
} from "./types.js";

/**
 * Build query parameter record from typed list parameters.
 *
 * Filter parameters use the `filter[key]` convention expected by the Qonto API.
 */
export function buildSupplierInvoiceQueryParams(params: ListSupplierInvoicesParams): QueryParams {
  const query: Record<string, string | readonly string[]> = {};

  if (params.status !== undefined && params.status.length > 0) {
    query["filter[status][]"] = params.status;
  }
  if (params.due_date !== undefined) {
    query["filter[due_date]"] = params.due_date;
  }
  if (params.created_at_from !== undefined) {
    query["filter[created_at_from]"] = params.created_at_from;
  }
  if (params.created_at_to !== undefined) {
    query["filter[created_at_to]"] = params.created_at_to;
  }
  if (params.updated_at_from !== undefined) {
    query["filter[updated_at_from]"] = params.updated_at_from;
  }
  if (params.updated_at_to !== undefined) {
    query["filter[updated_at_to]"] = params.updated_at_to;
  }
  if (params.query !== undefined) {
    query["query"] = params.query;
  }
  if (params.sort_by !== undefined) {
    query["sort_by"] = params.sort_by;
  }
  if (params.attachment_id !== undefined) {
    query["filter[attachment_id]"] = params.attachment_id;
  }
  if (params.attachment_ids !== undefined && params.attachment_ids.length > 0) {
    query["filter[attachment_id][]"] = params.attachment_ids;
  }
  if (params.payment_date !== undefined) {
    query["filter[payment_date]"] = params.payment_date;
  }
  if (params.issue_date !== undefined) {
    query["filter[issue_date]"] = params.issue_date;
  }
  if (params.issue_date_from !== undefined) {
    query["filter[issue_date_from]"] = params.issue_date_from;
  }
  if (params.missing_data !== undefined) {
    query["filter[missing_data]"] = String(params.missing_data);
  }
  if (params.matched_transactions !== undefined) {
    query["filter[matched_transactions]"] = String(params.matched_transactions);
  }
  if (params.document_type !== undefined) {
    query["filter[document_type]"] = params.document_type;
  }
  if (params.approver_ids !== undefined && params.approver_ids.length > 0) {
    query["filter[approver_id][]"] = params.approver_ids;
  }
  if (params.exclude_credit_notes !== undefined) {
    query["filter[exclude_credit_notes]"] = String(params.exclude_credit_notes);
  }
  if (params.payable_amount !== undefined) {
    query["filter[payable_amount]"] = params.payable_amount;
  }
  if (params.query_fields !== undefined) {
    query["query_fields"] = params.query_fields;
  }

  return query;
}

/**
 * Fetch a single supplier invoice by ID.
 */
export async function getSupplierInvoice(client: HttpClient, id: string): Promise<SupplierInvoice> {
  const endpointPath = `/v2/supplier_invoices/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(SupplierInvoiceResponseSchema, response, endpointPath).supplier_invoice;
}

/**
 * List supplier invoices with optional filtering and pagination.
 */
export async function listSupplierInvoices(
  client: HttpClient,
  params?: ListSupplierInvoicesParams & { page?: number; per_page?: number },
): Promise<{ supplier_invoices: SupplierInvoice[]; meta: PaginationMeta }> {
  const query: Record<string, string | readonly string[]> = {};
  if (params) {
    Object.assign(query, buildSupplierInvoiceQueryParams(params));
    if (params.page !== undefined) query["page"] = String(params.page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/supplier_invoices";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(SupplierInvoiceListResponseSchema, response, endpointPath);
}

/**
 * Bulk-create supplier invoices via multipart form upload.
 *
 * The API always returns HTTP 200. Check `result.errors` for per-invoice failures.
 */
export async function bulkCreateSupplierInvoices(
  client: HttpClient,
  entries: readonly BulkCreateSupplierInvoiceEntry[],
): Promise<BulkCreateSupplierInvoicesResult> {
  const formData = new FormData();

  for (const entry of entries) {
    formData.append("supplier_invoices[][file]", entry.file, entry.fileName);
    formData.append("supplier_invoices[][idempotency_key]", entry.idempotencyKey);
  }

  const endpointPath = "/v2/supplier_invoices/bulk";
  const response = await client.postFormData<BulkCreateSupplierInvoicesResult>(endpointPath, formData);
  return parseResponse(
    BulkCreateSupplierInvoicesResultSchema,
    response,
    endpointPath,
  ) as BulkCreateSupplierInvoicesResult;
}
