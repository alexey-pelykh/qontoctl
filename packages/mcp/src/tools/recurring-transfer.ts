// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type HttpClient,
  cancelRecurringTransfer,
  createRecurringTransfer,
  getRecurringTransfer,
  listRecurringTransfers,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerRecurringTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "recurring_transfer_create",
    {
      description: "Create a recurring transfer",
      inputSchema: {
        beneficiary_id: z.string().describe("Beneficiary UUID"),
        bank_account_id: z.string().describe("Bank account UUID to debit"),
        amount: z.number().positive().describe("Transfer amount"),
        currency: z.string().describe("Currency code (e.g. EUR)"),
        reference: z.string().describe("Transfer reference"),
        note: z.string().optional().describe("Optional note"),
        first_execution_date: z.string().describe("First execution date (YYYY-MM-DD)"),
        frequency: z.enum(["weekly", "monthly", "quarterly", "half_yearly", "yearly"]).describe("Transfer frequency"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const recurringTransfer = await createRecurringTransfer(client, {
          beneficiary_id: args.beneficiary_id,
          bank_account_id: args.bank_account_id,
          amount: args.amount,
          currency: args.currency,
          reference: args.reference,
          first_execution_date: args.first_execution_date,
          frequency: args.frequency,
          ...(args.note !== undefined ? { note: args.note } : {}),
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(recurringTransfer, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "recurring_transfer_cancel",
    {
      description: "Cancel a recurring transfer",
      inputSchema: {
        id: z.string().describe("Recurring transfer UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        await cancelRecurringTransfer(client, id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ canceled: true, id }, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "recurring_transfer_list",
    {
      description: "List recurring transfers",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number (default: 1)"),
        per_page: z.number().int().positive().max(100).optional().describe("Results per page (default: 100, max: 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const result = await listRecurringTransfers(client, {
          ...(args.page !== undefined ? { page: args.page } : {}),
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
