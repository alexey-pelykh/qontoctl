// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { WebhookSubscriptionSchema, WebhookSubscriptionListResponseSchema } from "./schemas.js";

describe("WebhookSubscriptionSchema", () => {
  // Mirrors the actual `POST/GET/PUT /v2/webhook_subscriptions[/:id]` response
  // shape (empirically verified 2026-05-10): `description` is omitted entirely
  // rather than returned as `null`, and the object is unwrapped (no
  // `webhook_subscription` envelope).
  const validWebhook = {
    id: "wh-1",
    organization_id: "org-1",
    membership_id: "mem-1",
    callback_url: "https://example.com/webhook",
    types: ["v1/transactions", "v1/cards"],
    secret: "whsec_abc123",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  };

  it("accepts a valid webhook subscription with description omitted (real API shape)", () => {
    const result = WebhookSubscriptionSchema.parse(validWebhook);
    expect(result).toEqual(validWebhook);
    expect(result.description).toBeUndefined();
  });

  it("accepts an explicit string description", () => {
    const result = WebhookSubscriptionSchema.parse({ ...validWebhook, description: "My webhook" });
    expect(result.description).toBe("My webhook");
  });

  it("accepts null for description (defensive — API currently omits)", () => {
    const result = WebhookSubscriptionSchema.parse({ ...validWebhook, description: null });
    expect(result.description).toBeNull();
  });

  it("accepts null for secret", () => {
    const result = WebhookSubscriptionSchema.parse({ ...validWebhook, secret: null });
    expect(result.secret).toBeNull();
  });

  it("accepts empty types array", () => {
    const result = WebhookSubscriptionSchema.parse({ ...validWebhook, types: [] });
    expect(result.types).toHaveLength(0);
  });

  it("strips extra fields", () => {
    const result = WebhookSubscriptionSchema.parse({ ...validWebhook, extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => WebhookSubscriptionSchema.parse({ ...validWebhook, id: undefined })).toThrow();
  });
});

describe("WebhookSubscriptionListResponseSchema", () => {
  it("validates the API list response (subscriptions key, NOT webhook_subscriptions)", () => {
    const response = {
      subscriptions: [
        {
          id: "wh-1",
          organization_id: "org-1",
          membership_id: "mem-1",
          callback_url: "https://example.com/webhook",
          types: ["v1/transactions"],
          secret: "whsec_abc",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 },
    };
    const result = WebhookSubscriptionListResponseSchema.parse(response);
    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0]?.id).toBe("wh-1");
  });

  it("rejects responses using the legacy webhook_subscriptions key", () => {
    const response = {
      webhook_subscriptions: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 25 },
    };
    expect(() => WebhookSubscriptionListResponseSchema.parse(response)).toThrow();
  });
});
