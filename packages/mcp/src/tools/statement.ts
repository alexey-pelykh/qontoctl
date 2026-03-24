// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HttpClient } from "@qontoctl/core";
import { getStatement, listStatements } from "@qontoctl/core";
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
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const result = await listStatements(client, {
          bank_account_ids: args.bank_account_id !== undefined ? [args.bank_account_id] : undefined,
          period_from: args.period_from,
          period_to: args.period_to,
          page: args.page,
          per_page: args.per_page,
        });

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
        const statement = await getStatement(client, args.id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(statement, null, 2),
            },
          ],
        };
      }),
  );
}
