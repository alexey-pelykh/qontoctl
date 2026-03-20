// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type HttpClient, getRecurringTransfer, listRecurringTransfers } from "@qontoctl/core";
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
        const result = await listRecurringTransfers(client, {
          ...(args.current_page !== undefined ? { current_page: args.current_page } : {}),
          ...(args.per_page !== undefined ? { per_page: args.per_page } : {}),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ recurring_transfers: result.recurring_transfers, meta: result.meta }, null, 2),
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
        const recurringTransfer = await getRecurringTransfer(client, id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(recurringTransfer, null, 2) }],
        };
      }),
  );
}
