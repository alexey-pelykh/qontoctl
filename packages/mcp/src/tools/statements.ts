// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerStatementTools(
  server: McpServer,
  getClient: () => Promise<HttpClient>,
): void {
  server.tool(
    "statement_list",
    "List bank statements with optional filters",
    {
      bank_account_id: z
        .string()
        .optional()
        .describe("Filter by bank account UUID (mutually exclusive with iban)"),
      iban: z
        .string()
        .optional()
        .describe("Filter by IBAN (mutually exclusive with bank_account_id)"),
      period_from: z.string().optional().describe("Start period (MM-YYYY format)"),
      period_to: z.string().optional().describe("End period (MM-YYYY format)"),
      sort_by: z.string().optional().describe("Sort order (period:asc or period:desc)"),
      current_page: z.number().int().positive().optional().describe("Page number (default: 1)"),
      per_page: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe("Results per page (default: 100, max: 100)"),
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};

        if (args.period_from !== undefined) params["period_from"] = args.period_from;
        if (args.period_to !== undefined) params["period_to"] = args.period_to;
        if (args.sort_by !== undefined) params["sort_by"] = args.sort_by;
        if (args.current_page !== undefined) params["current_page"] = String(args.current_page);
        if (args.per_page !== undefined) params["per_page"] = String(args.per_page);

        if (args.bank_account_id !== undefined)
          params["bank_account_ids[]"] = args.bank_account_id;
        if (args.iban !== undefined) params["ibans[]"] = args.iban;

        const response = await client.get<{ statements: unknown[]; meta: unknown }>(
          "/v2/statements",
          params,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { statements: response.statements, meta: response.meta },
                null,
                2,
              ),
            },
          ],
        };
      }),
  );

  server.tool(
    "statement_show",
    "Show details of a specific bank statement",
    {
      id: z.string().describe("Statement UUID"),
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<{ statement: unknown }>(`/v2/statements/${encodeURIComponent(id)}`);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(response.statement, null, 2) },
          ],
        };
      }),
  );
}
