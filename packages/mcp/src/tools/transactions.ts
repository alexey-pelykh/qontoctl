// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type HttpClient, getOrganization } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerTransactionTools(
  server: McpServer,
  getClient: () => Promise<HttpClient>,
): void {
  server.tool(
    "transaction_list",
    "List transactions for a bank account with optional filters",
    {
      bank_account_id: z.string().optional().describe("Bank account UUID"),
      iban: z.string().optional().describe("Bank account IBAN (alternative to bank_account_id)"),
      status: z
        .enum(["pending", "declined", "completed"])
        .optional()
        .describe("Filter by status"),
      settled_at_from: z
        .string()
        .optional()
        .describe("Start of settlement date range (ISO 8601)"),
      settled_at_to: z.string().optional().describe("End of settlement date range (ISO 8601)"),
      side: z.enum(["credit", "debit"]).optional().describe("Filter by side (credit or debit)"),
      operation_type: z
        .string()
        .optional()
        .describe("Filter by operation type (card, transfer, income, direct_debit, etc.)"),
      sort_by: z
        .string()
        .optional()
        .describe("Sort order (e.g. settled_at:desc, created_at:asc)"),
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

        let bankAccountId = args.bank_account_id;
        if (bankAccountId === undefined && args.iban === undefined) {
          const org = await getOrganization(client);
          const mainAccount = org.bank_accounts.find((a) => a.main) ?? org.bank_accounts[0];
          if (mainAccount !== undefined) {
            bankAccountId = mainAccount.id;
          }
        }

        if (bankAccountId !== undefined) params["bank_account_id"] = bankAccountId;
        if (args.iban !== undefined) params["iban"] = args.iban;
        if (args.settled_at_from !== undefined) params["settled_at_from"] = args.settled_at_from;
        if (args.settled_at_to !== undefined) params["settled_at_to"] = args.settled_at_to;
        if (args.side !== undefined) params["side"] = args.side;
        if (args.sort_by !== undefined) params["sort_by"] = args.sort_by;
        if (args.current_page !== undefined) params["current_page"] = String(args.current_page);
        if (args.per_page !== undefined) params["per_page"] = String(args.per_page);

        if (args.status !== undefined) params["status[]"] = args.status;
        if (args.operation_type !== undefined) params["operation_type[]"] = args.operation_type;

        const response = await client.get<{ transactions: unknown[]; meta: unknown }>(
          "/v2/transactions",
          params,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { transactions: response.transactions, meta: response.meta },
                null,
                2,
              ),
            },
          ],
        };
      }),
  );

  server.tool(
    "transaction_show",
    "Show details of a specific transaction",
    {
      id: z.string().describe("Transaction UUID"),
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<{ transaction: unknown }>(`/v2/transactions/${encodeURIComponent(id)}`);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(response.transaction, null, 2) },
          ],
        };
      }),
  );
}
