// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerRecurringTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "recurring_transfer_list",
    {
      description: "List recurring transfers",
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

        const response = await client.get<{ recurring_transfers: unknown[]; meta: unknown }>(
          "/v2/sepa/recurring_transfers",
          Object.keys(params).length > 0 ? params : undefined,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ recurring_transfers: response.recurring_transfers, meta: response.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "recurring_transfer_show",
    {
      description: "Show details of a specific recurring transfer",
      inputSchema: {
        id: z.string().describe("Recurring transfer UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<{ recurring_transfer: unknown }>(
          `/v2/sepa/recurring_transfers/${encodeURIComponent(id)}`,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.recurring_transfer, null, 2) }],
        };
      }),
  );
}
