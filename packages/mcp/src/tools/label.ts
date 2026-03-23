// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { parseResponse, LabelResponseSchema, LabelListResponseSchema } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerLabelTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "label_list",
    {
      description: "List all labels in the organization",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async ({ page, per_page }) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (page !== undefined) params["page"] = String(page);
        if (per_page !== undefined) params["per_page"] = String(per_page);

        const endpointPath = "/v2/labels";
        const response = await client.get(endpointPath, Object.keys(params).length > 0 ? params : undefined);
        const result = parseResponse(LabelListResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ labels: result.labels, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "label_show",
    {
      description: "Show details of a specific label",
      inputSchema: {
        id: z.string().describe("Label ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const endpointPath = `/v2/labels/${encodeURIComponent(id)}`;
        const response = await client.get(endpointPath);
        const result = parseResponse(LabelResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.label, null, 2),
            },
          ],
        };
      }),
  );
}
