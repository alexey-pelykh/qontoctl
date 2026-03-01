// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient, PaginationMeta, Transfer } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedTransfersResponse {
  readonly transfers: readonly Transfer[];
  readonly meta: PaginationMeta;
}

interface SingleTransferResponse {
  readonly transfer: Transfer;
}

export function registerTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "transfer_list",
    {
      description: "List SEPA transfers with optional filters",
      inputSchema: {
        status: z
          .enum(["pending", "processing", "canceled", "declined", "settled"])
          .optional()
          .describe("Filter by status"),
        beneficiary_id: z.string().optional().describe("Filter by beneficiary UUID"),
        updated_at_from: z.string().optional().describe("Start of update date range (ISO 8601)"),
        updated_at_to: z.string().optional().describe("End of update date range (ISO 8601)"),
        scheduled_date_from: z.string().optional().describe("Start of scheduled date range (YYYY-MM-DD)"),
        scheduled_date_to: z.string().optional().describe("End of scheduled date range (YYYY-MM-DD)"),
        sort_by: z
          .string()
          .optional()
          .describe("Sort order (e.g. updated_at:desc, scheduled_date:asc)"),
        current_page: z.number().int().positive().optional().describe("Page number (default: 1)"),
        per_page: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .describe("Results per page (default: 100, max: 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};

        if (args.status !== undefined) params["status[]"] = args.status;
        if (args.beneficiary_id !== undefined) params["beneficiary_ids[]"] = args.beneficiary_id;
        if (args.updated_at_from !== undefined) params["updated_at_from"] = args.updated_at_from;
        if (args.updated_at_to !== undefined) params["updated_at_to"] = args.updated_at_to;
        if (args.scheduled_date_from !== undefined) params["scheduled_date_from"] = args.scheduled_date_from;
        if (args.scheduled_date_to !== undefined) params["scheduled_date_to"] = args.scheduled_date_to;
        if (args.sort_by !== undefined) params["sort_by"] = args.sort_by;
        if (args.current_page !== undefined) params["current_page"] = String(args.current_page);
        if (args.per_page !== undefined) params["per_page"] = String(args.per_page);

        const response = await client.get<PaginatedTransfersResponse>(
          "/v2/sepa/transfers",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ transfers: response.transfers, meta: response.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "transfer_show",
    {
      description: "Show details of a specific SEPA transfer",
      inputSchema: {
        id: z.string().describe("Transfer UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<SingleTransferResponse>(
          `/v2/sepa/transfers/${encodeURIComponent(id)}`,
        );

        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.transfer, null, 2) }],
        };
      }),
  );
}
