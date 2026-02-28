// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HttpClient, PaginationMeta, Statement } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface StatementsResponse {
  readonly statements: readonly Statement[];
  readonly meta: PaginationMeta;
}

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

        const response = await client.get<StatementsResponse>(
          "/v2/statements",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
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
        const response = await client.get<{ statement: Statement }>(`/v2/statements/${encodeURIComponent(args.id)}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response.statement, null, 2),
            },
          ],
        };
      }),
  );
}
