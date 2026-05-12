// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { listProducts } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerProductTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "product_list",
    {
      description: "List products from the authenticated organization's catalogue",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
        sort_by: z
          .string()
          .optional()
          .describe('Sort order in the form "field:direction" (e.g. "created_at:desc", "title:asc")'),
      },
    },
    async ({ page, per_page, sort_by }) =>
      withClient(getClient, async (client) => {
        const result = await listProducts(client, {
          ...(page !== undefined ? { page } : {}),
          ...(per_page !== undefined ? { per_page } : {}),
          ...(sort_by !== undefined ? { sort_by } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ products: result.products, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );
}
