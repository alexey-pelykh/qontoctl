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
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async ({ page, per_page }) =>
      withClient(getClient, async (client) => {
        const result = await listWebhooks(client, {
          ...(page !== undefined ? { page } : {}),
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
        callback_url: z.string().describe("Callback URL for webhook delivery"),
        types: z.array(z.string()).min(1).describe("Event types to subscribe to"),
        secret: z.string().optional().describe("Secret for webhook signature verification"),
        description: z.string().optional().describe("Description of the webhook subscription"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const webhook = await createWebhook(client, {
          callback_url: args.callback_url,
          types: args.types,
          ...(args.secret !== undefined ? { secret: args.secret } : {}),
          ...(args.description !== undefined ? { description: args.description } : {}),
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
        callback_url: z.string().optional().describe("Callback URL for webhook delivery"),
        types: z.array(z.string()).min(1).optional().describe("Event types to subscribe to"),
        secret: z.string().optional().describe("Secret for webhook signature verification"),
        description: z.string().optional().describe("Description of the webhook subscription"),
      },
    },
    async ({ id, ...fields }) =>
      withClient(getClient, async (client) => {
        const params = {
          ...(fields.callback_url !== undefined ? { callback_url: fields.callback_url } : {}),
          ...(fields.types !== undefined ? { types: fields.types } : {}),
          ...(fields.secret !== undefined ? { secret: fields.secret } : {}),
          ...(fields.description !== undefined ? { description: fields.description } : {}),
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
