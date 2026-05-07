// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  bulkVerifyPayee,
  createBulkTransfer,
  getBeneficiary,
  getBulkTransfer,
  listBulkTransfers,
  type BulkTransferItem,
  type BulkVopResult,
  type HttpClient,
  type VopEntry,
} from "@qontoctl/core";
import { withClient } from "../errors.js";
import { coreOptionsFromContext, executeWithMcpSca, scaContinuationSchema, scaOptionsFromArgs } from "../sca.js";

const inlineBeneficiarySchema = z
  .object({
    name: z.string().describe("Beneficiary name"),
    iban: z.string().describe("Beneficiary IBAN"),
    bic: z.string().optional().describe("Beneficiary BIC"),
    email: z.string().optional().describe("Beneficiary email"),
    activity_tag: z.string().optional().describe("Beneficiary activity tag"),
  })
  .describe("Inline beneficiary (mutually exclusive with beneficiary_id at the item level)");

const bulkTransferItemSchema = z
  .object({
    client_transfer_id: z.uuid().optional().describe("Client-generated UUID for this item (auto-generated if omitted)"),
    amount: z.union([z.string(), z.number()]).describe("Transfer amount (number or string with up to 2 decimals)"),
    reference: z.string().describe("Transfer reference (max 140 chars)"),
    beneficiary_id: z.string().optional().describe("Existing beneficiary UUID (mutually exclusive with beneficiary)"),
    beneficiary: inlineBeneficiarySchema.optional(),
    scheduled_date: z.string().optional().describe("Scheduled date (YYYY-MM-DD)"),
    note: z.string().optional().describe("Optional note"),
    attachment_ids: z.array(z.string()).max(5).optional().describe("Attachment IDs (max 5)"),
  })
  .describe("A single transfer item within the bulk request");

function normalizeAmount(amount: string | number): string {
  if (typeof amount === "number") return amount.toFixed(2);
  return amount;
}

function normalizeItem(input: z.infer<typeof bulkTransferItemSchema>): BulkTransferItem {
  if (input.beneficiary_id !== undefined && input.beneficiary !== undefined) {
    throw new Error("Each transfer must specify exactly one of beneficiary_id or beneficiary, not both");
  }
  if (input.beneficiary_id === undefined && input.beneficiary === undefined) {
    throw new Error("Each transfer must specify either beneficiary_id or beneficiary");
  }
  return {
    client_transfer_id: input.client_transfer_id ?? randomUUID(),
    amount: normalizeAmount(input.amount),
    reference: input.reference,
    ...(input.beneficiary_id !== undefined ? { beneficiary_id: input.beneficiary_id } : {}),
    ...(input.beneficiary !== undefined ? { beneficiary: input.beneficiary } : {}),
    ...(input.scheduled_date !== undefined ? { scheduled_date: input.scheduled_date } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.attachment_ids !== undefined ? { attachment_ids: input.attachment_ids } : {}),
  };
}

async function vopEntryForItem(httpClient: HttpClient, item: BulkTransferItem): Promise<VopEntry> {
  if (item.beneficiary !== undefined) {
    return { iban: item.beneficiary.iban, beneficiary_name: item.beneficiary.name };
  }
  if (item.beneficiary_id !== undefined) {
    const beneficiary = await getBeneficiary(httpClient, item.beneficiary_id);
    return { iban: beneficiary.iban, beneficiary_name: beneficiary.name };
  }
  // normalizeItem guards against this; defensive only.
  throw new Error("Internal: cannot resolve VoP entry — missing beneficiary information");
}

interface BulkVopResolution {
  readonly proofToken: string;
  readonly result: BulkVopResult;
  readonly entries: readonly VopEntry[];
}

async function resolveBulkVop(httpClient: HttpClient, items: readonly BulkTransferItem[]): Promise<BulkVopResolution> {
  const entries = await Promise.all(items.map((item) => vopEntryForItem(httpClient, item)));
  const result = await bulkVerifyPayee(httpClient, entries);
  return { proofToken: result.proof_token.token, result, entries };
}

/**
 * Produce a human-readable per-entry warning line for any non-MATCH VoP result
 * or per-entry error. Returns an empty array when all entries are clean —
 * callers can then skip pushing the warning block entirely.
 *
 * Mirrors the pattern in `packages/cli/src/commands/bulk-transfer/create.ts`
 * (CLI surfaces the same signal to stderr) and the single-transfer MCP block
 * in `packages/mcp/src/tools/transfer.ts:213-218`.
 */
function bulkVopWarnings(result: BulkVopResult, inputs: readonly VopEntry[]): readonly string[] {
  const lines: string[] = [];
  for (const entry of result.requests) {
    // Contract: bulkVerifyPayee assigns id = String(index); see core/transfers/service.ts.
    const inputIndex = Number.parseInt(entry.id, 10);
    const input = Number.isNaN(inputIndex) ? undefined : inputs[inputIndex];
    const name = entry.beneficiary_name ?? input?.beneficiary_name ?? `entry ${entry.id}`;
    const iban = entry.iban ?? input?.iban ?? "unknown IBAN";
    const matchResult = entry.response?.match_result;
    if (entry.error !== undefined) {
      lines.push(`VoP error for beneficiary ${name} (${iban}): ${entry.error.code}`);
    } else if (matchResult === "MATCH_RESULT_NO_MATCH") {
      lines.push(`VoP result is "no match" for beneficiary ${name} (${iban})`);
    } else if (matchResult === "MATCH_RESULT_NOT_POSSIBLE") {
      lines.push(`VoP result is "not possible" for beneficiary ${name} (${iban})`);
    } else if (matchResult === "MATCH_RESULT_CLOSE_MATCH") {
      const matched = entry.response?.matched_name ?? null;
      const matchedSuffix = matched !== null && matched !== "" ? ` (matched name: ${matched})` : "";
      lines.push(`VoP result is "close match" for beneficiary ${name} (${iban})${matchedSuffix}`);
    }
  }
  return lines;
}

export function registerBulkTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "bulk_transfer_create",
    {
      description:
        "Create a bulk SEPA transfer from a debit account. Each item provides either beneficiary_id (existing) or beneficiary (inline name+iban). client_transfer_id is auto-generated when omitted; vop_proof_token is auto-resolved via bulk_verify_payee when omitted (and sca_session_token is not provided). SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        bank_account_id: z.string().describe("Bank account UUID to debit"),
        bulk_transfers: z.array(bulkTransferItemSchema).min(1).max(400).describe("Array of transfer items (1-400)"),
        vop_proof_token: z
          .string()
          .optional()
          .describe(
            "VoP proof token from bulk_verify_payee covering exactly the IBANs in this batch (auto-resolved when omitted, except on SCA retry)",
          ),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        let items: BulkTransferItem[];
        try {
          items = args.bulk_transfers.map(normalizeItem);
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
            isError: true,
          };
        }

        let vopProofToken = args.vop_proof_token;
        let vopWarnings: readonly string[] = [];

        // WI-K decision (#437) applied to bulk transfers: when retrying with a
        // caller-supplied `sca_session_token`, do NOT auto-resolve
        // `vop_proof_token` via bulk_verify_payee. PSD2 RTS Art. 5 (dynamic
        // linking) binds the SCA session to the original request body —
        // including `vop_proof_token`. Re-running bulk_verify_payee on retry
        // would yield a different batch-level proof token (or even a different
        // set if items shifted), changing the request shape and Qonto rejects
        // the bound session. The caller MUST pass the same `vop_proof_token`
        // alongside `sca_session_token`. See packages/mcp/src/tools/transfer.ts
        // WI-K block + docs/security/sca-token-binding.md (#438) for empirical
        // evidence and the canonical single-transfer commentary.
        if (vopProofToken === undefined && args.sca_session_token === undefined) {
          const resolution = await resolveBulkVop(client, items);
          vopProofToken = resolution.proofToken;
          vopWarnings = bulkVopWarnings(resolution.result, resolution.entries);
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
                    "The SCA session token is bound to the original bulk transfer's vop_proof_token (PSD2",
                    "dynamic linking, RTS Art. 5). Auto-resolution would generate a fresh batch-level token",
                    "and break the binding — Qonto would reject the retry. Supply the vop_proof_token from",
                    "the original attempt, or omit sca_session_token to start a fresh flow.",
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

        return executeWithMcpSca(
          client,
          (context) =>
            createBulkTransfer(
              client,
              {
                bank_account_id: args.bank_account_id,
                bulk_transfers: items,
                vop_proof_token: vopProofToken,
              },
              coreOptionsFromContext(context),
            ),
          (bulkTransfer) => {
            const content: { type: "text"; text: string }[] = [
              { type: "text" as const, text: JSON.stringify(bulkTransfer, null, 2) },
            ];
            if (vopWarnings.length > 0) {
              content.push({
                type: "text" as const,
                text: `VoP verification warnings:\n${vopWarnings.join("\n")}`,
              });
            }
            return { content };
          },
          scaOptionsFromArgs(args),
        );
      }),
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
