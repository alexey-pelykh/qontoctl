// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export { getWebhook, createWebhook, updateWebhook, deleteWebhook } from "./service.js";

export { WebhookSubscriptionSchema, WebhookSubscriptionResponseSchema } from "./schemas.js";

export type { CreateWebhookParams, UpdateWebhookParams } from "./types.js";
