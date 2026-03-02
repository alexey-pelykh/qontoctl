// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CreateTransferParams, HttpClient, PaginationMeta, Transfer, VopResult } from "@qontoctl/core";
import { createTransfer, cancelTransfer, getTransferProof, verifyPayee, bulkVerifyPayee } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedTransfersResponse {
  readonly transfers: readonly Transfer[];
  readonly meta: PaginationMeta;
}

interface SingleTransferResponse {
  readonly transfer: Transfer;
}

export function registerTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "transfer_list",
    {
      description: "List SEPA transfers with optional filters",
      inputSchema: {
        status: z
          .enum(["pending", "processing", "canceled", "declined", "settled"])
          .optional()
          .describe("Filter by status"),
        beneficiary_id: z.string().optional().describe("Filter by beneficiary UUID"),
        updated_at_from: z.string().optional().describe("Start of update date range (ISO 8601)"),
        updated_at_to: z.string().optional().describe("End of update date range (ISO 8601)"),
        scheduled_date_from: z.string().optional().describe("Start of scheduled date range (YYYY-MM-DD)"),
        scheduled_date_to: z.string().optional().describe("End of scheduled date range (YYYY-MM-DD)"),
        sort_by: z.string().optional().describe("Sort order (e.g. updated_at:desc, scheduled_date:asc)"),
        current_page: z.number().int().positive().optional().describe("Page number (default: 1)"),
        per_page: z.number().int().positive().max(100).optional().describe("Results per page (default: 100, max: 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};

        if (args.status !== undefined) params["status[]"] = args.status;
        if (args.beneficiary_id !== undefined) params["beneficiary_ids[]"] = args.beneficiary_id;
        if (args.updated_at_from !== undefined) params["updated_at_from"] = args.updated_at_from;
        if (args.updated_at_to !== undefined) params["updated_at_to"] = args.updated_at_to;
        if (args.scheduled_date_from !== undefined) params["scheduled_date_from"] = args.scheduled_date_from;
        if (args.scheduled_date_to !== undefined) params["scheduled_date_to"] = args.scheduled_date_to;
        if (args.sort_by !== undefined) params["sort_by"] = args.sort_by;
        if (args.current_page !== undefined) params["current_page"] = String(args.current_page);
        if (args.per_page !== undefined) params["per_page"] = String(args.per_page);

        const response = await client.get<PaginatedTransfersResponse>(
          "/v2/sepa/transfers",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ transfers: response.transfers, meta: response.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "transfer_show",
    {
      description: "Show details of a specific SEPA transfer",
      inputSchema: {
        id: z.string().describe("Transfer UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<SingleTransferResponse>(`/v2/sepa/transfers/${encodeURIComponent(id)}`);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.transfer, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "transfer_create",
    {
      description: "Create a SEPA transfer",
      inputSchema: {
        beneficiary_id: z.string().describe("Beneficiary UUID"),
        debit_account_id: z.string().describe("Bank account UUID to debit"),
        reference: z.string().describe("Transfer reference"),
        amount: z.number().positive().describe("Amount to transfer"),
        currency: z.string().optional().describe("Currency code (default: EUR)"),
        note: z.string().optional().describe("Optional note"),
        scheduled_date: z.string().optional().describe("Scheduled date (YYYY-MM-DD)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: CreateTransferParams = {
          beneficiary_id: args.beneficiary_id,
          debit_account_id: args.debit_account_id,
          reference: args.reference,
          amount: args.amount,
          currency: args.currency ?? "EUR",
          ...(args.note !== undefined ? { note: args.note } : {}),
          ...(args.scheduled_date !== undefined ? { scheduled_date: args.scheduled_date } : {}),
        };

        const transfer = await createTransfer(client, params);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(transfer, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "transfer_cancel",
    {
      description: "Cancel a pending SEPA transfer",
      inputSchema: {
        id: z.string().describe("Transfer UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        await cancelTransfer(client, id);

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ canceled: true, id }, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "transfer_proof",
    {
      description: "Download SEPA transfer proof PDF (returns base64-encoded content)",
      inputSchema: {
        id: z.string().describe("Transfer UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const buffer = await getTransferProof(client, id);

        return {
          content: [
            {
              type: "resource" as const,
              resource: {
                uri: `transfer-proof://${id}`,
                mimeType: "application/pdf",
                blob: buffer.toString("base64"),
              },
            },
          ],
        };
      }),
  );

  server.registerTool(
    "transfer_verify_payee",
    {
      description: "Verify a payee (Verification of Payee / VoP)",
      inputSchema: {
        iban: z.string().describe("IBAN to verify"),
        name: z.string().describe("Name to verify against the IBAN"),
      },
    },
    async ({ iban, name }) =>
      withClient(getClient, async (client) => {
        const result: VopResult = await verifyPayee(client, { iban, name });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "transfer_bulk_verify_payee",
    {
      description: "Bulk verify payees (Verification of Payee / VoP)",
      inputSchema: {
        entries: z
          .array(z.object({ iban: z.string(), name: z.string() }))
          .min(1)
          .describe("Array of { iban, name } entries to verify"),
      },
    },
    async ({ entries }) =>
      withClient(getClient, async (client) => {
        const results = await bulkVerifyPayee(client, entries);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        };
      }),
  );
}
