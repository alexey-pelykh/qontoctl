// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient, PaginationMeta, Request } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedRequestsResponse {
  readonly requests: readonly Request[];
  readonly meta: PaginationMeta;
}

export function registerRequestTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "request_list",
    {
      description: "List all requests in the organization",
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

        const response = await client.get<PaginatedRequestsResponse>(
          "/v2/requests",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ requests: response.requests, meta: response.meta }, null, 2),
            },
          ],
        };
      }),
  );
}
