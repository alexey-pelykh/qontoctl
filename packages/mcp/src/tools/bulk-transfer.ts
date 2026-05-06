// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type HttpClient, createBulkTransfer, getBulkTransfer, listBulkTransfers } from "@qontoctl/core";
import { withClient } from "../errors.js";
import { coreOptionsFromContext, executeWithMcpSca, scaContinuationSchema, scaOptionsFromArgs } from "../sca.js";

export function registerBulkTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "bulk_transfer_create",
    {
      description:
        "Create a bulk transfer. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        transfers: z
          .array(
            z.object({
              beneficiary_id: z.string().describe("Beneficiary UUID"),
              amount: z.number().positive().describe("Transfer amount"),
              currency: z.string().describe("Currency code (e.g. EUR)"),
              reference: z.string().optional().describe("Transfer reference"),
            }),
          )
          .min(1)
          .describe("Array of transfers to create"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) => createBulkTransfer(client, { transfers: args.transfers }, coreOptionsFromContext(context)),
          (bulkTransfer) => ({
            content: [{ type: "text" as const, text: JSON.stringify(bulkTransfer, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "bulk_transfer_list",
    {
      description: "List bulk transfers",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number (default: 1)"),
        per_page: z.number().int().positive().max(100).optional().describe("Results per page (default: 100, max: 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const result = await listBulkTransfers(client, {
          ...(args.page !== undefined ? { page: args.page } : {}),
          ...(args.per_page !== undefined ? { per_page: args.per_page } : {}),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ bulk_transfers: result.bulk_transfers, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "bulk_transfer_show",
    {
      description: "Show details of a specific bulk transfer",
      inputSchema: {
        id: z.string().describe("Bulk transfer UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const bulkTransfer = await getBulkTransfer(client, id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(bulkTransfer, null, 2) }],
        };
      }),
  );
}
