// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { getWebhook, listWebhooks, createWebhook, updateWebhook, deleteWebhook } from "@qontoctl/core";
import { withClient } from "../errors.js";

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
        const result = await listWebhooks(client, {
          ...(current_page !== undefined ? { current_page } : {}),
          ...(per_page !== undefined ? { per_page } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ webhook_subscriptions: result.webhook_subscriptions, meta: result.meta }, null, 2),
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
        const webhookSubscription = await getWebhook(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(webhookSubscription, null, 2),
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
