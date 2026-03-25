// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { getIntlEligibility, listIntlCurrencies, createIntlQuote } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerInternationalTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "intl_eligibility",
    {
      description: "Check eligibility for international transfers",
      inputSchema: {},
    },
    async () =>
      withClient(getClient, async (client) => {
        const eligibility = await getIntlEligibility(client);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(eligibility, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "intl_currencies",
    {
      description: "List supported currencies for international transfers",
      inputSchema: {
        search: z.string().optional().describe("Filter currencies by code or name"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        let currencies = await listIntlCurrencies(client);

        if (args.search !== undefined) {
          const term = args.search.toLowerCase();
          currencies = currencies.filter(
            (c) => c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term),
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(currencies, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "intl_quote_create",
    {
      description: "Create an international transfer quote with exchange rate",
      inputSchema: {
        currency: z.string().describe("Target currency code (e.g. USD, GBP)"),
        amount: z.number().positive().describe("Amount to send or receive"),
        direction: z
          .enum(["send", "receive"])
          .optional()
          .default("send")
          .describe("Whether amount is to send or receive (default: send)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const quote = await createIntlQuote(client, {
          currency: args.currency,
          amount: args.amount,
          direction: args.direction,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(quote, null, 2),
            },
          ],
        };
      }),
  );
}
