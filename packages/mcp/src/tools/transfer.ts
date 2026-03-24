// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CreateTransferParams, HttpClient, VopResult } from "@qontoctl/core";
import {
  getBeneficiary,
  getTransfer,
  listTransfers,
  createTransfer,
  cancelTransfer,
  getTransferProof,
  verifyPayee,
  bulkVerifyPayee,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

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
        page: z.number().int().positive().optional().describe("Page number (default: 1)"),
        per_page: z.number().int().positive().max(100).optional().describe("Results per page (default: 100, max: 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const result = await listTransfers(client, {
          ...(args.status !== undefined ? { status: [args.status] } : {}),
          ...(args.beneficiary_id !== undefined ? { beneficiary_ids: [args.beneficiary_id] } : {}),
          ...(args.updated_at_from !== undefined ? { updated_at_from: args.updated_at_from } : {}),
          ...(args.updated_at_to !== undefined ? { updated_at_to: args.updated_at_to } : {}),
          ...(args.scheduled_date_from !== undefined ? { scheduled_date_from: args.scheduled_date_from } : {}),
          ...(args.scheduled_date_to !== undefined ? { scheduled_date_to: args.scheduled_date_to } : {}),
          ...(args.sort_by !== undefined ? { sort_by: args.sort_by } : {}),
          ...(args.page !== undefined ? { page: args.page } : {}),
          ...(args.per_page !== undefined ? { per_page: args.per_page } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ transfers: result.transfers, meta: result.meta }, null, 2),
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
        const transfer = await getTransfer(client, id);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(transfer, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "transfer_create",
    {
      description:
        "Create a SEPA transfer. Provide either beneficiary_id (existing beneficiary) or beneficiary (inline beneficiary object with name and iban), but not both.",
      inputSchema: {
        beneficiary_id: z.string().optional().describe("Existing beneficiary UUID (mutually exclusive with beneficiary)"),
        beneficiary: z
          .object({
            name: z.string().describe("Beneficiary name"),
            iban: z.string().describe("Beneficiary IBAN"),
            bic: z.string().optional().describe("Beneficiary BIC"),
            email: z.string().optional().describe("Beneficiary email"),
            activity_tag: z.string().optional().describe("Beneficiary activity tag"),
          })
          .optional()
          .describe("Inline beneficiary object (mutually exclusive with beneficiary_id)"),
        bank_account_id: z.string().describe("Bank account UUID to debit"),
        reference: z.string().describe("Transfer reference"),
        amount: z.number().positive().describe("Amount to transfer"),
        note: z.string().optional().describe("Optional note"),
        scheduled_date: z.string().optional().describe("Scheduled date (YYYY-MM-DD)"),
        attachment_ids: z
          .array(z.string())
          .max(5)
          .optional()
          .describe("Attachment IDs (max 5, required for transfers > 30k EUR)"),
        vop_proof_token: z
          .string()
          .optional()
          .describe("VoP proof token from verify-payee (auto-resolved when omitted)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        if (args.beneficiary_id !== undefined && args.beneficiary !== undefined) {
          throw new Error("Cannot specify both beneficiary_id and beneficiary");
        }
        if (args.beneficiary_id === undefined && args.beneficiary === undefined) {
          throw new Error("Either beneficiary_id or beneficiary must be provided");
        }

        let vopProofToken = args.vop_proof_token;
        let vopResult: VopResult | undefined;

        if (vopProofToken === undefined) {
          if (args.beneficiary !== undefined) {
            vopResult = await verifyPayee(client, { iban: args.beneficiary.iban, name: args.beneficiary.name });
          } else {
            const beneficiary = await getBeneficiary(client, args.beneficiary_id!);
            vopResult = await verifyPayee(client, { iban: beneficiary.iban, name: beneficiary.name });
          }
          vopProofToken = vopResult.vop_proof_token;
        }

        const params: CreateTransferParams = {
          ...(args.beneficiary_id !== undefined ? { beneficiary_id: args.beneficiary_id } : {}),
          ...(args.beneficiary !== undefined ? { beneficiary: args.beneficiary } : {}),
          bank_account_id: args.bank_account_id,
          reference: args.reference,
          amount: String(args.amount),
          vop_proof_token: vopProofToken,
          ...(args.note !== undefined ? { note: args.note } : {}),
          ...(args.scheduled_date !== undefined ? { scheduled_date: args.scheduled_date } : {}),
          ...(args.attachment_ids !== undefined ? { attachment_ids: args.attachment_ids } : {}),
        };

        const transfer = await createTransfer(client, params);

        const content: { type: "text"; text: string }[] = [
          { type: "text" as const, text: JSON.stringify(transfer, null, 2) },
        ];
        if (vopResult !== undefined && vopResult.result !== "match") {
          content.push({
            type: "text" as const,
            text: `VoP verification result: ${vopResult.result}`,
          });
        }

        return { content };
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
