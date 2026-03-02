// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient, PaginationMeta, WebhookSubscription } from "@qontoctl/core";
import { createWebhook, updateWebhook, deleteWebhook } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedWebhookSubscriptionsResponse {
  readonly webhook_subscriptions: readonly WebhookSubscription[];
  readonly meta: PaginationMeta;
}

interface SingleWebhookSubscriptionResponse {
  readonly webhook_subscription: WebhookSubscription;
}

export function registerWebhookTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "webhook_list",
    {
      description: "List webhook subscriptions",
      inputSchema: {
        current_page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async ({ current_page, per_page }) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (current_page !== undefined) params["current_page"] = String(current_page);
        if (per_page !== undefined) params["per_page"] = String(per_page);

        const response = await client.get<PaginatedWebhookSubscriptionsResponse>(
          "/v2/webhook_subscriptions",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { webhook_subscriptions: response.webhook_subscriptions, meta: response.meta },
                null,
                2,
              ),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "webhook_show",
    {
      description: "Show details of a specific webhook subscription",
      inputSchema: {
        id: z.string().describe("Webhook subscription ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<SingleWebhookSubscriptionResponse>(
          `/v2/webhook_subscriptions/${encodeURIComponent(id)}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response.webhook_subscription, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "webhook_create",
    {
      description: "Create a new webhook subscription",
      inputSchema: {
        url: z.string().describe("Callback URL for webhook delivery"),
        event_types: z.array(z.string()).min(1).describe("Event types to subscribe to"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const webhook = await createWebhook(client, {
          url: args.url,
          event_types: args.event_types,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(webhook, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "webhook_update",
    {
      description: "Update an existing webhook subscription",
      inputSchema: {
        id: z.string().describe("Webhook subscription ID (UUID)"),
        url: z.string().optional().describe("Callback URL for webhook delivery"),
        event_types: z.array(z.string()).min(1).optional().describe("Event types to subscribe to"),
      },
    },
    async ({ id, ...fields }) =>
      withClient(getClient, async (client) => {
        const params = {
          ...(fields.url !== undefined ? { url: fields.url } : {}),
          ...(fields.event_types !== undefined ? { event_types: fields.event_types } : {}),
        };

        const webhook = await updateWebhook(client, id, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(webhook, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "webhook_delete",
    {
      description: "Delete a webhook subscription",
      inputSchema: {
        id: z.string().describe("Webhook subscription ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        await deleteWebhook(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ deleted: true, id }, null, 2),
            },
          ],
        };
      }),
  );
}
