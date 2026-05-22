// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient, QueryParams } from "../http-client.js";
import { z } from "zod";
import { parseResponse } from "../response.js";
import { ClientInvoiceListResponseSchema, ClientInvoiceResponseSchema, ClientInvoiceUploadSchema } from "./schemas.js";
import type {
  ClientInvoice,
  ClientInvoiceUpload,
  CreateClientInvoiceParams,
  ListClientInvoicesParams,
  SendClientInvoiceRequestPayload,
  UpdateClientInvoiceParams,
} from "./types.js";
const ClientInvoiceUploadResponseSchema = z.object({ upload: ClientInvoiceUploadSchema });

/**
 * Build query parameters for the client invoices list endpoint.
 */
export function buildClientInvoiceQueryParams(params: ListClientInvoicesParams): QueryParams {
  const query: Record<string, string | readonly string[]> = {};

  if (params.status !== undefined && params.status.length > 0) {
    query["filter[status]"] = params.status;
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
  if (params.due_date !== undefined) {
    query["filter[due_date]"] = params.due_date;
  }
  if (params.due_date_from !== undefined) {
    query["filter[due_date_from]"] = params.due_date_from;
  }
  if (params.due_date_to !== undefined) {
    query["filter[due_date_to]"] = params.due_date_to;
  }
  if (params.exclude_imported !== undefined) {
    query["exclude_imported"] = String(params.exclude_imported);
  }
  if (params.sort_by !== undefined) {
    query["sort_by"] = params.sort_by;
  }

  return query;
}

/**
 * List client invoices with optional filtering and pagination.
 */
export async function listClientInvoices(
  client: HttpClient,
  params?: ListClientInvoicesParams & { page?: number; per_page?: number },
): Promise<{ client_invoices: ClientInvoice[]; meta: PaginationMeta }> {
  const query: Record<string, string | readonly string[]> = {};
  if (params) {
    Object.assign(query, buildClientInvoiceQueryParams(params));
    if (params.page !== undefined) query["page"] = String(params.page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/client_invoices";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(ClientInvoiceListResponseSchema, response, endpointPath);
}

/**
 * Retrieve a single client invoice by ID.
 */
export async function getClientInvoice(client: HttpClient, id: string): Promise<ClientInvoice> {
  const endpointPath = `/v2/client_invoices/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(ClientInvoiceResponseSchema, response, endpointPath).client_invoice;
}

/**
 * Create a draft client invoice.
 */
export async function createClientInvoice(
  client: HttpClient,
  params: CreateClientInvoiceParams,
  options?: { readonly idempotencyKey?: string },
): Promise<ClientInvoice> {
  const endpointPath = "/v2/client_invoices";
  const response = await client.post(endpointPath, { client_invoice: params }, options);
  return parseResponse(ClientInvoiceResponseSchema, response, endpointPath).client_invoice;
}

/**
 * Update a draft client invoice.
 */
export async function updateClientInvoice(
  client: HttpClient,
  id: string,
  params: UpdateClientInvoiceParams,
  options?: { readonly idempotencyKey?: string },
): Promise<ClientInvoice> {
  const endpointPath = `/v2/client_invoices/${encodeURIComponent(id)}`;
  const response = await client.patch(endpointPath, { client_invoice: params }, options);
  return parseResponse(ClientInvoiceResponseSchema, response, endpointPath).client_invoice;
}

/**
 * Delete a draft client invoice.
 */
export async function deleteClientInvoice(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string },
): Promise<void> {
  await client.delete(`/v2/client_invoices/${encodeURIComponent(id)}`, options);
}

/**
 * Finalize a client invoice (assign number, transition from draft to unpaid).
 */
export async function finalizeClientInvoice(client: HttpClient, id: string): Promise<ClientInvoice> {
  const endpointPath = `/v2/client_invoices/${encodeURIComponent(id)}/finalize`;
  const response = await client.post(endpointPath);
  return parseResponse(ClientInvoiceResponseSchema, response, endpointPath).client_invoice;
}

/**
 * Send a client invoice to the client via email.
 *
 * BREAKING (#637): this function requires a third `payload` argument
 * (see {@link SendClientInvoiceRequestPayload}). Earlier versions called
 * `POST .../send` with no body, which the Qonto API rejected with HTTP 422
 * `invalid_body: EOF` — the parallel-bug class to #636 arm 1 on the quotes
 * side. Consumers must adjust call sites to provide `send_to` and
 * `email_title` at minimum; see the migration note shipped with #639.
 *
 * Issues `POST /v2/client_invoices/{id}/send` with the payload serialised as
 * the JSON request body. The HTTP client sets `Content-Type:
 * application/json` automatically because the request carries a body (see
 * `http-client.ts#buildHeaders`). Validation against
 * {@link SendClientInvoiceRequestPayload} is the caller's responsibility —
 * this service passes the payload through verbatim to keep request shaping
 * at the call site (MCP tool / CLI command) where the end-user-facing error
 * surface lives.
 *
 * Reference: https://docs.qonto.com/api-reference/business-api/expense-management/client-quotes-notes/client-invoices/send-a-client-invoice.md
 */
export async function sendClientInvoice(
  client: HttpClient,
  id: string,
  payload: SendClientInvoiceRequestPayload,
): Promise<void> {
  await client.requestVoid("POST", `/v2/client_invoices/${encodeURIComponent(id)}/send`, { body: payload });
}

/**
 * Mark a client invoice as paid.
 */
export async function markClientInvoicePaid(client: HttpClient, id: string): Promise<ClientInvoice> {
  const endpointPath = `/v2/client_invoices/${encodeURIComponent(id)}/mark_as_paid`;
  const response = await client.post(endpointPath);
  return parseResponse(ClientInvoiceResponseSchema, response, endpointPath).client_invoice;
}

/**
 * Unmark a client invoice as paid (transition back to unpaid).
 */
export async function unmarkClientInvoicePaid(client: HttpClient, id: string): Promise<ClientInvoice> {
  const endpointPath = `/v2/client_invoices/${encodeURIComponent(id)}/unmark_as_paid`;
  const response = await client.post(endpointPath);
  return parseResponse(ClientInvoiceResponseSchema, response, endpointPath).client_invoice;
}

/**
 * Cancel a finalized client invoice.
 *
 * Transitions invoice status from `unpaid` to `canceled` — a billing-state
 * change, not a payment-initiation operation. SCA not required by the Qonto
 * API as of 2026-05-12; verified against the official endpoint documentation
 * (`POST /v2/client_invoices/{id}/mark_as_canceled` declares responses
 * `200`/`400`/`401`/`403`/`422`/`500` — no `428 Precondition Required`, which
 * is the SCA-required signal per the Qonto SCA flow docs). The OAuth scope
 * (`client_invoice.write`) is a billing scope, distinct from payment-write
 * scopes that gate PSD2 dynamic-linking SCA flows. The signature intentionally
 * omits an `options` parameter (no `idempotencyKey`/`scaSessionToken`) — the
 * absence is structural: no SCA continuation surface exists on this endpoint.
 *
 * If this assumption ever needs re-verification:
 * - Source: https://docs.qonto.com/api-reference/business-api/expense-management/client-quotes-notes/client-invoices/mark-a-client-invoice-as-canceled.md
 * - SCA contract: https://docs.qonto.com/api-reference/business-api/authentication/sca/sca-flows.md
 * - Re-audit ticket: #528 (closed) — repeat the response-code check
 */
export async function cancelClientInvoice(client: HttpClient, id: string): Promise<ClientInvoice> {
  const endpointPath = `/v2/client_invoices/${encodeURIComponent(id)}/mark_as_canceled`;
  const response = await client.post(endpointPath);
  return parseResponse(ClientInvoiceResponseSchema, response, endpointPath).client_invoice;
}

/**
 * Upload a file to a client invoice.
 */
export async function uploadClientInvoiceFile(
  client: HttpClient,
  invoiceId: string,
  file: Blob,
  fileName: string,
  options?: { readonly idempotencyKey?: string },
): Promise<ClientInvoiceUpload> {
  const formData = new FormData();
  formData.append("file", file, fileName);

  const endpointPath = `/v2/client_invoices/${encodeURIComponent(invoiceId)}/uploads`;
  const response = await client.postFormData(endpointPath, formData, options);
  return parseResponse(ClientInvoiceUploadResponseSchema, response, endpointPath).upload;
}

/**
 * Retrieve upload details for a client invoice.
 */
export async function getClientInvoiceUpload(
  client: HttpClient,
  invoiceId: string,
  uploadId: string,
): Promise<ClientInvoiceUpload> {
  const endpointPath = `/v2/client_invoices/${encodeURIComponent(invoiceId)}/uploads/${encodeURIComponent(uploadId)}`;
  const response = await client.get(endpointPath);
  return parseResponse(ClientInvoiceUploadResponseSchema, response, endpointPath).upload;
}
