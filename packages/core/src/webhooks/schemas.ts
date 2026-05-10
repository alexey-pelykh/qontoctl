// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { WebhookSubscription } from "../types/webhook-subscription.js";

/**
 * Schema for a webhook subscription returned by `/v2/webhook_subscriptions`.
 *
 * Empirical observation (2026-05-10, sandbox + production endpoints): the
 * Qonto API does NOT wrap single-resource responses (POST/GET/PUT) in a
 * `{ webhook_subscription: ... }` envelope — the object is returned directly.
 * The list endpoint wraps under `subscriptions` (NOT `webhook_subscriptions`).
 * The `description` field is omitted entirely from API responses rather than
 * returned as `null`. This schema models the actual contract; prior versions
 * (with response wrappers + required nullable description) were aspirational
 * and caused both CLI list (silent empty array) and every MCP webhook tool
 * call to fail. Drift uncovered by #452's real-API CRUD round-trip E2E.
 */
export const WebhookSubscriptionSchema = z
  .object({
    id: z.string(),
    organization_id: z.string(),
    membership_id: z.string(),
    callback_url: z.string(),
    types: z.array(z.string()),
    description: z.string().nullish(),
    secret: z.nullable(z.string()),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strip() satisfies z.ZodType<WebhookSubscription>;

/**
 * Schema for `GET /v2/webhook_subscriptions` (list response).
 *
 * The API wraps the array under `subscriptions` (NOT `webhook_subscriptions`).
 */
export const WebhookSubscriptionListResponseSchema = z
  .object({
    subscriptions: z.array(WebhookSubscriptionSchema),
    meta: PaginationMetaSchema,
  })
  .strip();
