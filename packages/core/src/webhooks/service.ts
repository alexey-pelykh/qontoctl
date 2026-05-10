// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import type { WebhookSubscription } from "../types/webhook-subscription.js";
import { WebhookSubscriptionListResponseSchema, WebhookSubscriptionSchema } from "./schemas.js";
import type { CreateWebhookParams, UpdateWebhookParams } from "./types.js";

/**
 * List webhook subscriptions with optional pagination.
 *
 * The API wraps results under `subscriptions` (NOT `webhook_subscriptions`).
 */
export async function listWebhooks(
  client: HttpClient,
  params?: { page?: number; per_page?: number },
): Promise<{ subscriptions: WebhookSubscription[]; meta: PaginationMeta }> {
  const query: Record<string, string | readonly string[]> = {};
  if (params) {
    if (params.page !== undefined) query["page"] = String(params.page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/webhook_subscriptions";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(WebhookSubscriptionListResponseSchema, response, endpointPath);
}

/**
 * Fetch a single webhook subscription by ID.
 *
 * The API returns the object directly (no `webhook_subscription` envelope).
 */
export async function getWebhook(client: HttpClient, id: string): Promise<WebhookSubscription> {
  const endpointPath = `/v2/webhook_subscriptions/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(WebhookSubscriptionSchema, response, endpointPath);
}

/**
 * Create a new webhook subscription.
 *
 * The API returns the object directly (no `webhook_subscription` envelope).
 */
export async function createWebhook(
  client: HttpClient,
  params: CreateWebhookParams,
  options?: { readonly idempotencyKey?: string },
): Promise<WebhookSubscription> {
  const endpointPath = "/v2/webhook_subscriptions";
  const response = await client.post(endpointPath, params, options);
  return parseResponse(WebhookSubscriptionSchema, response, endpointPath);
}

/**
 * Update an existing webhook subscription.
 *
 * The API returns the object directly (no `webhook_subscription` envelope).
 * Note: the Qonto API treats PUT as a full-resource replacement — `callback_url`
 * must be re-sent on every update even when unchanged, otherwise the API returns
 * "HTTP 400: CallbackURL is missing". This service layer mirrors the API contract
 * directly; callers wanting partial-update ergonomics need to fetch-then-merge.
 */
export async function updateWebhook(
  client: HttpClient,
  id: string,
  params: UpdateWebhookParams,
  options?: { readonly idempotencyKey?: string },
): Promise<WebhookSubscription> {
  const endpointPath = `/v2/webhook_subscriptions/${encodeURIComponent(id)}`;
  const response = await client.put(endpointPath, params, options);
  return parseResponse(WebhookSubscriptionSchema, response, endpointPath);
}

/**
 * Delete a webhook subscription.
 */
export async function deleteWebhook(
  client: HttpClient,
  id: string,
  options?: { readonly idempotencyKey?: string },
): Promise<void> {
  await client.delete(`/v2/webhook_subscriptions/${encodeURIComponent(id)}`, options);
}
