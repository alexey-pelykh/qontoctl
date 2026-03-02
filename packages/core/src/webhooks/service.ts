// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import type { WebhookSubscription } from "../types/webhook-subscription.js";
import type { CreateWebhookParams, UpdateWebhookParams } from "./types.js";

/**
 * Fetch a single webhook subscription by ID.
 */
export async function getWebhook(client: HttpClient, id: string): Promise<WebhookSubscription> {
  const response = await client.get<{ webhook_subscription: WebhookSubscription }>(
    `/v2/webhook_subscriptions/${encodeURIComponent(id)}`,
  );
  return response.webhook_subscription;
}

/**
 * Create a new webhook subscription.
 */
export async function createWebhook(
  client: HttpClient,
  params: CreateWebhookParams,
  options?: { readonly idempotencyKey?: string },
): Promise<WebhookSubscription> {
  const response = await client.post<{ webhook_subscription: WebhookSubscription }>(
    "/v2/webhook_subscriptions",
    params,
    options,
  );
  return response.webhook_subscription;
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
  const response = await client.put<{ webhook_subscription: WebhookSubscription }>(
    `/v2/webhook_subscriptions/${encodeURIComponent(id)}`,
    params,
    options,
  );
  return response.webhook_subscription;
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
