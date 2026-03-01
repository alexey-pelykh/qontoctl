// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient, QueryParams } from "../http-client.js";
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

  return query;
}

/**
 * Fetch a single supplier invoice by ID.
 */
export async function getSupplierInvoice(client: HttpClient, id: string): Promise<SupplierInvoice> {
  const response = await client.get<{ supplier_invoice: SupplierInvoice }>(
    `/v2/supplier_invoices/${encodeURIComponent(id)}`,
  );
  return response.supplier_invoice;
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

  return client.postFormData<BulkCreateSupplierInvoicesResult>("/v2/supplier_invoices/bulk", formData);
}
