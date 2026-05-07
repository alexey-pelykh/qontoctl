// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type HttpClient,
  type VopResult,
  cancelRecurringTransfer,
  createRecurringTransfer,
  getBeneficiary,
  getRecurringTransfer,
  listRecurringTransfers,
  verifyPayee,
} from "@qontoctl/core";
import { withClient } from "../errors.js";
import { coreOptionsFromContext, executeWithMcpSca, scaContinuationSchema, scaOptionsFromArgs } from "../sca.js";

/**
 * Coerce an MCP-supplied amount (number or string) into the API's required
 * decimal-string format (`^\d+(\.\d{1,2})?$`). Numbers are formatted with two
 * decimal places; strings are passed through and validated server-side.
 */
function normalizeAmount(amount: string | number): string {
  if (typeof amount === "number") return amount.toFixed(2);
  return amount;
}

export function registerRecurringTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "recurring_transfer_create",
    {
      description:
        "Create a recurring transfer. vop_proof_token is auto-resolved via verify_payee when omitted (and sca_session_token is not provided). SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        beneficiary_id: z.string().describe("Beneficiary UUID"),
        bank_account_id: z.string().describe("Bank account UUID to debit"),
        amount: z
          .union([z.number().positive(), z.string()])
          .describe("Transfer amount (number or decimal string; serialized as a string per the Qonto API)"),
        currency: z.string().describe("Currency code (e.g. EUR)"),
        reference: z.string().describe("Transfer reference"),
        note: z.string().optional().describe("Optional note"),
        first_execution_date: z.string().describe("First execution date (YYYY-MM-DD)"),
        frequency: z.enum(["weekly", "monthly", "quarterly", "half_yearly", "yearly"]).describe("Transfer frequency"),
        vop_proof_token: z
          .string()
          .optional()
          .describe(
            "VoP proof token from verify_payee covering the beneficiary (auto-resolved when omitted, except on SCA retry per PSD2 dynamic linking)",
          ),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        let vopProofToken = args.vop_proof_token;
        let vopResult: VopResult | undefined;

        // WI-K decision (#437) applied to recurring transfers: when retrying
        // with a caller-supplied `sca_session_token`, do NOT auto-resolve
        // `vop_proof_token` via verifyPayee. PSD2 RTS Art. 5 (dynamic linking)
        // binds the SCA session token to the original recurring transfer's
        // request body — including `vop_proof_token`. Re-running verifyPayee
        // on retry would yield a fresh proof token, changing the request shape,
        // and Qonto rejects the bound session. The caller MUST supply the same
        // `vop_proof_token` from the original attempt alongside
        // `sca_session_token`. See `packages/mcp/src/tools/transfer.ts` WI-K
        // block + `docs/security/sca-token-binding.md` (#438) for the
        // empirical evidence and the canonical single-transfer commentary.
        if (vopProofToken === undefined && args.sca_session_token === undefined) {
          const beneficiary = await getBeneficiary(client, args.beneficiary_id);
          vopResult = await verifyPayee(client, {
            iban: beneficiary.iban,
            beneficiary_name: beneficiary.name,
          });
          vopProofToken = vopResult.proof_token.token;
        }

        if (vopProofToken === undefined) {
          if (args.sca_session_token !== undefined) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: [
                    "vop_proof_token is required when retrying with sca_session_token.",
                    "",
                    "The SCA session token is bound to the original recurring transfer's vop_proof_token (PSD2",
                    "dynamic linking, RTS Art. 5). Auto-resolution would generate a fresh token and break the",
                    "binding — Qonto would reject the retry. Supply the vop_proof_token from the original",
                    "attempt, or omit sca_session_token to start a fresh flow.",
                  ].join("\n"),
                },
              ],
              isError: true,
            };
          }
          return {
            content: [{ type: "text" as const, text: "Could not resolve VoP proof token" }],
            isError: true,
          };
        }

        const resolvedVopProofToken = vopProofToken;

        return executeWithMcpSca(
          client,
          (context) =>
            createRecurringTransfer(
              client,
              {
                beneficiary_id: args.beneficiary_id,
                bank_account_id: args.bank_account_id,
                amount: normalizeAmount(args.amount),
                currency: args.currency,
                reference: args.reference,
                first_execution_date: args.first_execution_date,
                frequency: args.frequency,
                vop_proof_token: resolvedVopProofToken,
                ...(args.note !== undefined ? { note: args.note } : {}),
              },
              coreOptionsFromContext(context),
            ),
          (recurringTransfer) => {
            const content: { type: "text"; text: string }[] = [
              { type: "text" as const, text: JSON.stringify(recurringTransfer, null, 2) },
            ];
            if (vopResult !== undefined && vopResult.match_result !== "MATCH_RESULT_MATCH") {
              content.push({
                type: "text" as const,
                text: `VoP verification result: ${vopResult.match_result}`,
              });
            }
            return { content };
          },
          scaOptionsFromArgs(args),
        );
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
