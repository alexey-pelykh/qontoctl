// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type HttpClient, createInternalTransfer } from "@qontoctl/core";
import { withClient } from "../errors.js";
import { coreOptionsFromContext, executeWithMcpSca, scaContinuationSchema, scaOptionsFromArgs } from "../sca.js";

export function registerInternalTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "internal_transfer_create",
    {
      description:
        "Create an internal transfer between two bank accounts within the same organization. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        debit_iban: z.string().describe("IBAN of the account to debit"),
        credit_iban: z.string().describe("IBAN of the account to credit"),
        reference: z.string().max(99).describe("Transfer reference (max 99 characters)"),
        amount: z.number().positive().describe("Amount to transfer"),
        currency: z.string().default("EUR").describe("Currency code (must be EUR)"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) =>
            createInternalTransfer(
              client,
              {
                debit_iban: args.debit_iban,
                credit_iban: args.credit_iban,
                reference: args.reference,
                amount: String(args.amount),
                currency: args.currency,
              },
              coreOptionsFromContext(context),
            ),
          (internalTransfer) => ({
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(internalTransfer, null, 2),
              },
            ],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );
}
