// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient, QueryParams } from "../http-client.js";
import type { ClientInvoice, ClientInvoiceUpload, ListClientInvoicesParams } from "./types.js";

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
 * Retrieve a single client invoice by ID.
 */
export async function getClientInvoice(client: HttpClient, id: string): Promise<ClientInvoice> {
  const response = await client.get<{ client_invoice: ClientInvoice }>(
    `/v2/client_invoices/${encodeURIComponent(id)}`,
  );
  return response.client_invoice;
}

/**
 * Create a draft client invoice.
 */
export async function createClientInvoice(
  client: HttpClient,
  body: unknown,
  options?: { readonly idempotencyKey?: string },
): Promise<ClientInvoice> {
  const response = await client.post<{ client_invoice: ClientInvoice }>("/v2/client_invoices", body, options);
  return response.client_invoice;
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
  const response = await client.patch<{ client_invoice: ClientInvoice }>(
    `/v2/client_invoices/${encodeURIComponent(id)}`,
    body,
    options,
  );
  return response.client_invoice;
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
  const response = await client.post<{ client_invoice: ClientInvoice }>(
    `/v2/client_invoices/${encodeURIComponent(id)}/finalize`,
  );
  return response.client_invoice;
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
  const response = await client.post<{ client_invoice: ClientInvoice }>(
    `/v2/client_invoices/${encodeURIComponent(id)}/mark_as_paid`,
  );
  return response.client_invoice;
}

/**
 * Unmark a client invoice as paid (transition back to pending).
 */
export async function unmarkClientInvoicePaid(client: HttpClient, id: string): Promise<ClientInvoice> {
  const response = await client.post<{ client_invoice: ClientInvoice }>(
    `/v2/client_invoices/${encodeURIComponent(id)}/unmark_as_paid`,
  );
  return response.client_invoice;
}

/**
 * Cancel a finalized client invoice.
 */
export async function cancelClientInvoice(client: HttpClient, id: string): Promise<ClientInvoice> {
  const response = await client.post<{ client_invoice: ClientInvoice }>(
    `/v2/client_invoices/${encodeURIComponent(id)}/mark_as_canceled`,
  );
  return response.client_invoice;
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

  const response = await client.postFormData<{ upload: ClientInvoiceUpload }>(
    `/v2/client_invoices/${encodeURIComponent(invoiceId)}/uploads`,
    formData,
    options,
  );
  return response.upload;
}

/**
 * Retrieve upload details for a client invoice.
 */
export async function getClientInvoiceUpload(
  client: HttpClient,
  invoiceId: string,
  uploadId: string,
): Promise<ClientInvoiceUpload> {
  const response = await client.get<{ upload: ClientInvoiceUpload }>(
    `/v2/client_invoices/${encodeURIComponent(invoiceId)}/uploads/${encodeURIComponent(uploadId)}`,
  );
  return response.upload;
}
