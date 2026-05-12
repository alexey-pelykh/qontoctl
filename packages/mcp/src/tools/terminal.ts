// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient, TerminalAmount } from "@qontoctl/core";
import { createTerminalPayment, listTerminals } from "@qontoctl/core";
import { withClient } from "../errors.js";

/**
 * Validate a Qonto Terminal payment amount string at the MCP boundary.
 *
 * The Qonto API requires `amount.value` to be a decimal string (not a JSON
 * number) in the `0.10` – `100000.00` range. We normalize to `X.YY` so an LLM
 * that emits `"12"` or `"12.5"` still produces a Qonto-shaped request.
 */
function normalizeAmount(raw: string): string {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`amount must be a decimal string with up to 2 decimal places (e.g. "12.50"), got "${raw}"`);
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0.1 || numeric > 100_000) {
    throw new Error(`amount must be between 0.10 and 100000.00, got "${raw}"`);
  }
  return numeric.toFixed(2);
}

export function registerTerminalTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "terminal_list",
    {
      description: "List Qonto Terminals (POS) linked to the authenticated organization",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async ({ page, per_page }) =>
      withClient(getClient, async (client) => {
        const result = await listTerminals(client, {
          ...(page !== undefined ? { page } : {}),
          ...(per_page !== undefined ? { per_page } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ terminals: result.terminals, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "terminal_payment_create",
    {
      description:
        "Initiate a payment on a Qonto Terminal (POS). Returns 202 Accepted — the terminal must still physically accept the card before the payment settles. An offline terminal may hold the request open for up to ~120 seconds.",
      inputSchema: {
        terminal_id: z.string().describe("Terminal ID (UUID) — retrieve via terminal_list"),
        amount: z
          .string()
          .describe(
            'Payment amount as a decimal string with up to 2 decimal places (e.g. "12.50"). Range: 0.10–100000.00.',
          ),
        currency: z.literal("EUR").default("EUR").describe("ISO 4217 currency code (Qonto Terminals: EUR only)"),
        metadata: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Free-form JSON metadata (max 1 KB, echoed back in response and webhook events)"),
      },
    },
    async ({ terminal_id, amount, currency, metadata }) =>
      withClient(getClient, async (client) => {
        const normalizedAmount: TerminalAmount = { value: normalizeAmount(amount), currency };

        const payment = await createTerminalPayment(client, terminal_id, {
          amount: normalizedAmount,
          ...(metadata !== undefined ? { metadata } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payment, null, 2),
            },
          ],
        };
      }),
  );
}
