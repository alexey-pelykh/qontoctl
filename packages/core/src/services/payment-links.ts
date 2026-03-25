// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient, QueryParams } from "../http-client.js";
import { parseResponse } from "../response.js";
import type {
  PaymentLink,
  PaymentLinkConnection,
  PaymentLinkPayment,
  PaymentLinkPaymentMethod,
} from "../types/payment-link.js";
import {
  PaymentLinkResponseSchema,
  PaymentLinkListResponseSchema,
  PaymentLinkPaymentListResponseSchema,
  PaymentLinkPaymentMethodListResponseSchema,
  PaymentLinkConnectionSchema,
} from "../types/payment-link.schema.js";

export interface ListPaymentLinksParams {
  readonly page?: number | undefined;
  readonly per_page?: number | undefined;
  readonly status?: readonly string[] | undefined;
  readonly sort_by?: string | undefined;
}

export interface CreateBasketPaymentLinkParams {
  readonly potential_payment_methods: readonly string[];
  readonly reusable?: boolean | undefined;
  readonly items: readonly {
    readonly title: string;
    readonly quantity: number;
    readonly unit_price: { readonly value: string; readonly currency: string };
    readonly vat_rate: string;
    readonly type?: string | undefined;
    readonly description?: string | undefined;
    readonly measure_unit?: string | undefined;
  }[];
}

export interface CreateInvoicePaymentLinkParams {
  readonly invoice_id: string;
  readonly invoice_number: string;
  readonly debitor_name: string;
  readonly amount: { readonly value: string; readonly currency: string };
  readonly potential_payment_methods: readonly string[];
}

export type CreatePaymentLinkParams = CreateBasketPaymentLinkParams | CreateInvoicePaymentLinkParams;

export interface ConnectPaymentLinksParams {
  readonly partner_callback_url: string;
  readonly user_bank_account_id: string;
  readonly user_phone_number: string;
  readonly user_website_url: string;
  readonly business_description?: string | null | undefined;
}

export function buildPaymentLinkQueryParams(params: ListPaymentLinksParams): QueryParams {
  const query: Record<string, string> = {};
  if (params.page !== undefined) query["page"] = String(params.page);
  if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  if (params.status !== undefined && params.status.length > 0) query["status[]"] = params.status.join(",");
  if (params.sort_by !== undefined) query["sort_by"] = params.sort_by;
  return query;
}

/**
 * List payment links.
 *
 * @param client - The HTTP client to use for the request.
 * @param params - Optional filter and pagination parameters.
 * @returns The payment links and pagination metadata.
 */
export async function listPaymentLinks(
  client: HttpClient,
  params?: ListPaymentLinksParams,
): Promise<{ payment_links: PaymentLink[]; meta: PaginationMeta }> {
  const query = params !== undefined ? buildPaymentLinkQueryParams(params) : undefined;
  const endpointPath = "/v2/payment_links";
  const response = await client.get(
    endpointPath,
    query !== undefined && Object.keys(query).length > 0 ? query : undefined,
  );
  return parseResponse(PaymentLinkListResponseSchema, response, endpointPath);
}

/**
 * Fetch a single payment link by ID.
 *
 * @param client - The HTTP client to use for the request.
 * @param id - The payment link UUID.
 * @returns The payment link details.
 */
export async function getPaymentLink(client: HttpClient, id: string): Promise<PaymentLink> {
  const endpointPath = `/v2/payment_links/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(PaymentLinkResponseSchema, response, endpointPath).payment_link;
}

/**
 * Create a new payment link.
 *
 * @param client - The HTTP client to use for the request.
 * @param params - The payment link creation parameters (basket or invoice).
 * @param options - Optional idempotency key.
 * @returns The created payment link.
 */
export async function createPaymentLink(
  client: HttpClient,
  params: CreatePaymentLinkParams,
  options?: { readonly idempotencyKey?: string },
): Promise<PaymentLink> {
  const endpointPath = "/v2/payment_links";
  const response = await client.post(endpointPath, { payment_link: params }, options);
  return parseResponse(PaymentLinkResponseSchema, response, endpointPath).payment_link;
}

/**
 * Deactivate a payment link.
 *
 * @param client - The HTTP client to use for the request.
 * @param id - The payment link UUID.
 * @returns The deactivated payment link.
 */
export async function deactivatePaymentLink(client: HttpClient, id: string): Promise<PaymentLink> {
  const endpointPath = `/v2/payment_links/${encodeURIComponent(id)}/deactivate`;
  const response = await client.request("PATCH", endpointPath);
  return parseResponse(PaymentLinkResponseSchema, response, endpointPath).payment_link;
}

/**
 * List payments for a payment link.
 *
 * @param client - The HTTP client to use for the request.
 * @param id - The payment link UUID.
 * @param params - Optional pagination parameters.
 * @returns The payments and pagination metadata.
 */
export async function listPaymentLinkPayments(
  client: HttpClient,
  id: string,
  params?: { page?: number; per_page?: number },
): Promise<{ payments: PaymentLinkPayment[]; meta: PaginationMeta }> {
  const query: Record<string, string> = {};
  if (params?.page !== undefined) query["page"] = String(params.page);
  if (params?.per_page !== undefined) query["per_page"] = String(params.per_page);
  const endpointPath = `/v2/payment_links/${encodeURIComponent(id)}/payments`;
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(PaymentLinkPaymentListResponseSchema, response, endpointPath);
}

/**
 * List available payment methods for payment links.
 *
 * @param client - The HTTP client to use for the request.
 * @returns The available payment methods.
 */
export async function listPaymentMethods(
  client: HttpClient,
): Promise<{ payment_link_payment_methods: PaymentLinkPaymentMethod[] }> {
  const endpointPath = "/v2/payment_links/payment_methods";
  const response = await client.get(endpointPath);
  return parseResponse(PaymentLinkPaymentMethodListResponseSchema, response, endpointPath);
}

/**
 * Establish a payment link connection.
 *
 * @param client - The HTTP client to use for the request.
 * @param params - The connection parameters.
 * @returns The connection details.
 */
export async function connectPaymentLinks(
  client: HttpClient,
  params: ConnectPaymentLinksParams,
): Promise<PaymentLinkConnection> {
  const endpointPath = "/v2/payment_links/connections";
  const response = await client.post(endpointPath, params);
  return parseResponse(PaymentLinkConnectionSchema, response, endpointPath);
}

/**
 * Get payment link connection status.
 *
 * @param client - The HTTP client to use for the request.
 * @returns The connection status.
 */
export async function getConnectionStatus(client: HttpClient): Promise<PaymentLinkConnection> {
  const endpointPath = "/v2/payment_links/connections";
  const response = await client.get(endpointPath);
  return parseResponse(PaymentLinkConnectionSchema, response, endpointPath);
}
