// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { WebhookSubscriptionSchema, WebhookSubscriptionResponseSchema } from "./schemas.js";

describe("WebhookSubscriptionSchema", () => {
  const validWebhook = {
    id: "wh-1",
    url: "https://example.com/webhook",
    event_types: ["transfer.created", "transfer.updated"],
    status: "enabled",
    secret: "whsec_abc123",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  };

  it("accepts a valid webhook subscription", () => {
    const result = WebhookSubscriptionSchema.parse(validWebhook);
    expect(result).toEqual(validWebhook);
  });

  it("accepts null for secret", () => {
    const result = WebhookSubscriptionSchema.parse({ ...validWebhook, secret: null });
    expect(result.secret).toBeNull();
  });

  it("accepts empty event_types array", () => {
    const result = WebhookSubscriptionSchema.parse({ ...validWebhook, event_types: [] });
    expect(result.event_types).toHaveLength(0);
  });

  it("strips extra fields", () => {
    const result = WebhookSubscriptionSchema.parse({ ...validWebhook, extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => WebhookSubscriptionSchema.parse({ ...validWebhook, id: undefined })).toThrow();
  });
});

describe("WebhookSubscriptionResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      webhook_subscription: {
        id: "wh-1",
        url: "https://example.com/webhook",
        event_types: ["transfer.created"],
        status: "enabled",
        secret: null,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    };
    const result = WebhookSubscriptionResponseSchema.parse(response);
    expect(result.webhook_subscription.id).toBe("wh-1");
  });
});
