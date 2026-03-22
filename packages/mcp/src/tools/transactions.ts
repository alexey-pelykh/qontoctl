// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type HttpClient,
  getOrganization,
  resolveDefaultBankAccount,
  getTransaction,
  listTransactions,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerTransactionTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "transaction_list",
    {
      description: "List transactions for a bank account with optional filters",
      inputSchema: {
        bank_account_id: z.string().optional().describe("Bank account UUID"),
        iban: z.string().optional().describe("Bank account IBAN (alternative to bank_account_id)"),
        status: z.enum(["pending", "declined", "completed"]).optional().describe("Filter by status"),
        settled_at_from: z.string().optional().describe("Start of settlement date range (ISO 8601)"),
        settled_at_to: z.string().optional().describe("End of settlement date range (ISO 8601)"),
        emitted_at_from: z.string().optional().describe("Start of emission date range (ISO 8601)"),
        emitted_at_to: z.string().optional().describe("End of emission date range (ISO 8601)"),
        updated_at_from: z.string().optional().describe("Start of update date range (ISO 8601)"),
        updated_at_to: z.string().optional().describe("End of update date range (ISO 8601)"),
        side: z.enum(["credit", "debit"]).optional().describe("Filter by side (credit or debit)"),
        operation_type: z
          .string()
          .optional()
          .describe("Filter by operation type (card, transfer, income, direct_debit, etc.)"),
        sort_by: z.string().optional().describe("Sort order (e.g. settled_at:desc, created_at:asc)"),
        current_page: z.number().int().positive().optional().describe("Page number (default: 1)"),
        per_page: z.number().int().positive().max(100).optional().describe("Results per page (default: 100, max: 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        let bankAccountId = args.bank_account_id;
        if (bankAccountId === undefined && args.iban === undefined) {
          const org = await getOrganization(client);
          const mainAccount = resolveDefaultBankAccount(org);
          if (mainAccount !== undefined) {
            bankAccountId = mainAccount.id;
          }
        }

        const result = await listTransactions(client, {
          ...(bankAccountId !== undefined ? { bank_account_id: bankAccountId } : {}),
          ...(args.iban !== undefined ? { iban: args.iban } : {}),
          ...(args.settled_at_from !== undefined ? { settled_at_from: args.settled_at_from } : {}),
          ...(args.settled_at_to !== undefined ? { settled_at_to: args.settled_at_to } : {}),
          ...(args.emitted_at_from !== undefined ? { emitted_at_from: args.emitted_at_from } : {}),
          ...(args.emitted_at_to !== undefined ? { emitted_at_to: args.emitted_at_to } : {}),
          ...(args.updated_at_from !== undefined ? { updated_at_from: args.updated_at_from } : {}),
          ...(args.updated_at_to !== undefined ? { updated_at_to: args.updated_at_to } : {}),
          ...(args.side !== undefined ? { side: args.side } : {}),
          ...(args.sort_by !== undefined ? { sort_by: args.sort_by } : {}),
          ...(args.status !== undefined ? { status: [args.status] } : {}),
          ...(args.operation_type !== undefined ? { operation_type: [args.operation_type] } : {}),
          ...(args.current_page !== undefined ? { current_page: args.current_page } : {}),
          ...(args.per_page !== undefined ? { per_page: args.per_page } : {}),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ transactions: result.transactions, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "transaction_show",
    {
      description: "Show details of a specific transaction",
      inputSchema: {
        id: z.string().describe("Transaction UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const transaction = await getTransaction(client, id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(transaction, null, 2) }],
        };
      }),
  );
}
