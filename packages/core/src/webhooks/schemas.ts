// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { WebhookSubscription } from "../types/webhook-subscription.js";

export const WebhookSubscriptionSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  membership_id: z.string(),
  callback_url: z.string(),
  types: z.array(z.string()),
  description: z.nullable(z.string()),
  secret: z.nullable(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<WebhookSubscription>;

export const WebhookSubscriptionResponseSchema = z.object({
  webhook_subscription: WebhookSubscriptionSchema,
});

export const WebhookSubscriptionListResponseSchema = z.object({
  webhook_subscriptions: z.array(WebhookSubscriptionSchema),
  meta: PaginationMetaSchema,
});
