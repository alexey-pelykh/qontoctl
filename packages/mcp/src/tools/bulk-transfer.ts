// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerBulkTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "bulk_transfer_list",
    {
      description: "List bulk transfers",
      inputSchema: {
        current_page: z.number().int().positive().optional().describe("Page number (default: 1)"),
        per_page: z.number().int().positive().max(100).optional().describe("Results per page (default: 100, max: 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};

        if (args.current_page !== undefined) params["current_page"] = String(args.current_page);
        if (args.per_page !== undefined) params["per_page"] = String(args.per_page);

        const response = await client.get<{ bulk_transfers: unknown[]; meta: unknown }>(
          "/v2/sepa/bulk_transfers",
          Object.keys(params).length > 0 ? params : undefined,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ bulk_transfers: response.bulk_transfers, meta: response.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "bulk_transfer_show",
    {
      description: "Show details of a specific bulk transfer",
      inputSchema: {
        id: z.string().describe("Bulk transfer UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<{ bulk_transfer: unknown }>(
          `/v2/sepa/bulk_transfers/${encodeURIComponent(id)}`,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.bulk_transfer, null, 2) }],
        };
      }),
  );
}
