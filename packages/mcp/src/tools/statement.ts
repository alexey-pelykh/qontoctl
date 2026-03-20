// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HttpClient } from "@qontoctl/core";
import { parseResponse, StatementResponseSchema, StatementListResponseSchema } from "@qontoctl/core";
import { withClient } from "../errors.js";

/**
 * Register statement-related MCP tools on the server.
 */
export function registerStatementTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "statement_list",
    {
      description: "List bank statements with optional filters",
      inputSchema: {
        bank_account_id: z.string().optional().describe("Filter by bank account ID"),
        period_from: z.string().optional().describe("Start period (MM-YYYY)"),
        period_to: z.string().optional().describe("End period (MM-YYYY)"),
        current_page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};

        if (args.bank_account_id !== undefined) {
          params["bank_account_ids[]"] = args.bank_account_id;
        }
        if (args.period_from !== undefined) {
          params["period_from"] = args.period_from;
        }
        if (args.period_to !== undefined) {
          params["period_to"] = args.period_to;
        }
        if (args.current_page !== undefined) {
          params["current_page"] = String(args.current_page);
        }
        if (args.per_page !== undefined) {
          params["per_page"] = String(args.per_page);
        }

        const endpointPath = "/v2/statements";
        const response = await client.get(endpointPath, Object.keys(params).length > 0 ? params : undefined);
        const result = parseResponse(StatementListResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "statement_show",
    {
      description: "Show details of a specific bank statement",
      inputSchema: {
        id: z.string().describe("Statement ID"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const endpointPath = `/v2/statements/${encodeURIComponent(args.id)}`;
        const response = await client.get(endpointPath);
        const result = parseResponse(StatementResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.statement, null, 2),
            },
          ],
        };
      }),
  );
}
