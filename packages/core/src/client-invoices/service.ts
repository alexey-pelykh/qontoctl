// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient, QueryParams } from "../http-client.js";
import { z } from "zod";
import { parseResponse } from "../response.js";
import { ClientInvoiceListResponseSchema, ClientInvoiceResponseSchema, ClientInvoiceUploadSchema } from "./schemas.js";
import type { ClientInvoice, ClientInvoiceUpload, ListClientInvoicesParams } from "./types.js";
const ClientInvoiceUploadResponseSchema = z.object({ upload: ClientInvoiceUploadSchema });

/**
 * Build query parameters for the client invoices list endpoint.
 */
export function buildClientInvoiceQueryParams(params: ListClientInvoicesParams): QueryParams {
  const query: Record<string, string | readonly string[]> = {};

  if (params.status !== undefined && params.status.length > 0) {
    query["filter[status][]"] = params.status;
  }
  if (params.client_id !== undefined) {
    query["filter[client_id]"] = params.client_id;
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
  body: unknown,
  options?: { readonly idempotencyKey?: string },
): Promise<ClientInvoice> {
  const endpointPath = "/v2/client_invoices";
  const response = await client.post(endpointPath, body, options);
  return parseResponse(ClientInvoiceResponseSchema, response, endpointPath).client_invoice;
}

/**
 * Update a draft client invoice.
 */
export async function updateClientInvoice(
  client: HttpClient,
  id: string,
  body: unknown,
  options?: { readonly idempotencyKey?: string },
): Promise<ClientInvoice> {
  const endpointPath = `/v2/client_invoices/${encodeURIComponent(id)}`;
  const response = await client.patch(endpointPath, body, options);
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
 * Finalize a client invoice (assign number, transition from draft to pending).
 */
export async function finalizeClientInvoice(client: HttpClient, id: string): Promise<ClientInvoice> {
  const endpointPath = `/v2/client_invoices/${encodeURIComponent(id)}/finalize`;
  const response = await client.post(endpointPath);
  return parseResponse(ClientInvoiceResponseSchema, response, endpointPath).client_invoice;
}

/**
 * Send a client invoice to the client via email.
 */
export async function sendClientInvoice(client: HttpClient, id: string): Promise<void> {
  await client.requestVoid("POST", `/v2/client_invoices/${encodeURIComponent(id)}/send`);
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
 * Unmark a client invoice as paid (transition back to pending).
 */
export async function unmarkClientInvoicePaid(client: HttpClient, id: string): Promise<ClientInvoice> {
  const endpointPath = `/v2/client_invoices/${encodeURIComponent(id)}/unmark_as_paid`;
  const response = await client.post(endpointPath);
  return parseResponse(ClientInvoiceResponseSchema, response, endpointPath).client_invoice;
}

/**
 * Cancel a finalized client invoice.
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
