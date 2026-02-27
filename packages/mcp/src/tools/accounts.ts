// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerAccountTools(
  server: McpServer,
  getClient: () => Promise<HttpClient>,
): void {
  server.tool(
    "account_list",
    "List all bank accounts for the organization",
    {},
    async () =>
      withClient(getClient, async (client) => {
        const response = await client.get<{ bank_accounts: unknown[] }>("/v2/bank_accounts");
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(response.bank_accounts, null, 2) },
          ],
        };
      }),
  );

  server.tool(
    "account_show",
    "Show details of a specific bank account",
    {
      id: z.string().describe("Bank account UUID"),
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<{ bank_account: unknown }>(`/v2/bank_accounts/${id}`);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(response.bank_account, null, 2) },
          ],
        };
      }),
  );
}
