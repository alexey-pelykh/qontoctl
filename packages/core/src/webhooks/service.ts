// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import type { WebhookSubscription } from "../types/webhook-subscription.js";
import { WebhookSubscriptionListResponseSchema, WebhookSubscriptionResponseSchema } from "./schemas.js";
import type { CreateWebhookParams, UpdateWebhookParams } from "./types.js";

/**
 * List webhook subscriptions with optional pagination.
 */
export async function listWebhooks(
  client: HttpClient,
  params?: { current_page?: number; per_page?: number },
): Promise<{ webhook_subscriptions: WebhookSubscription[]; meta: PaginationMeta }> {
  const query: Record<string, string | readonly string[]> = {};
  if (params) {
    if (params.current_page !== undefined) query["current_page"] = String(params.current_page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
  }
  const endpointPath = "/v2/webhook_subscriptions";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(WebhookSubscriptionListResponseSchema, response, endpointPath);
}

/**
 * Fetch a single webhook subscription by ID.
 */
export async function getWebhook(client: HttpClient, id: string): Promise<WebhookSubscription> {
  const endpointPath = `/v2/webhook_subscriptions/${encodeURIComponent(id)}`;
  const response = await client.get(endpointPath);
  return parseResponse(WebhookSubscriptionResponseSchema, response, endpointPath).webhook_subscription;
}

/**
 * Create a new webhook subscription.
 */
export async function createWebhook(
  client: HttpClient,
  params: CreateWebhookParams,
  options?: { readonly idempotencyKey?: string },
): Promise<WebhookSubscription> {
  const endpointPath = "/v2/webhook_subscriptions";
  const response = await client.post(endpointPath, params, options);
  return parseResponse(WebhookSubscriptionResponseSchema, response, endpointPath).webhook_subscription;
}

/**
 * Update an existing webhook subscription.
 */
export async function updateWebhook(
  client: HttpClient,
  id: string,
  params: UpdateWebhookParams,
  options?: { readonly idempotencyKey?: string },
): Promise<WebhookSubscription> {
  const endpointPath = `/v2/webhook_subscriptions/${encodeURIComponent(id)}`;
  const response = await client.put(endpointPath, params, options);
  return parseResponse(WebhookSubscriptionResponseSchema, response, endpointPath).webhook_subscription;
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
