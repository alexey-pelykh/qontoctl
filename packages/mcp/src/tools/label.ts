// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient, Label, PaginationMeta } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedLabelsResponse {
  readonly labels: readonly Label[];
  readonly meta: PaginationMeta;
}

interface SingleLabelResponse {
  readonly label: Label;
}

export function registerLabelTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "label_list",
    {
      description: "List all labels in the organization",
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

        const response = await client.get<PaginatedLabelsResponse>(
          "/v2/labels",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ labels: response.labels, meta: response.meta }, null, 2),
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
        const response = await client.get<SingleLabelResponse>(`/v2/labels/${encodeURIComponent(id)}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response.label, null, 2),
            },
          ],
        };
      }),
  );
}
