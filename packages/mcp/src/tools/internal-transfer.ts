// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type HttpClient, createInternalTransfer } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerInternalTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "internal_transfer_create",
    {
      description: "Create an internal transfer between two bank accounts within the same organization",
      inputSchema: {
        debit_iban: z.string().describe("IBAN of the account to debit"),
        credit_iban: z.string().describe("IBAN of the account to credit"),
        reference: z.string().max(99).describe("Transfer reference (max 99 characters)"),
        amount: z.number().positive().describe("Amount to transfer"),
        currency: z.string().default("EUR").describe("Currency code (must be EUR)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const internalTransfer = await createInternalTransfer(client, {
          debit_iban: args.debit_iban,
          credit_iban: args.credit_iban,
          reference: args.reference,
          amount: args.amount,
          currency: args.currency,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(internalTransfer, null, 2),
            },
          ],
        };
      }),
  );
}
