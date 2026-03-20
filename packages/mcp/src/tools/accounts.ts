// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type HttpClient,
  getIbanCertificate,
  listBankAccounts,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  closeBankAccount,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerAccountTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool("account_list", { description: "List all bank accounts for the organization" }, async () =>
    withClient(getClient, async (client) => {
      const result = await listBankAccounts(client);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.bank_accounts, null, 2) }],
      };
    }),
  );

  server.registerTool(
    "account_show",
    {
      description: "Show details of a specific bank account",
      inputSchema: {
        id: z.string().describe("Bank account UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const bankAccount = await getBankAccount(client, id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(bankAccount, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "account_iban_certificate",
    {
      description: "Download IBAN certificate PDF for a bank account",
      inputSchema: {
        id: z.string().describe("Bank account UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const buffer = await getIbanCertificate(client, id);
        return {
          content: [
            {
              type: "resource" as const,
              resource: {
                uri: `qontoctl://iban-certificate/${encodeURIComponent(id)}`,
                mimeType: "application/pdf",
                blob: buffer.toString("base64"),
              },
            },
          ],
        };
      }),
  );

  server.registerTool(
    "account_create",
    {
      description: "Create a new bank account",
      inputSchema: {
        name: z.string().describe("Account name"),
      },
    },
    async ({ name }) =>
      withClient(getClient, async (client) => {
        const bankAccount = await createBankAccount(client, { name });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(bankAccount, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "account_update",
    {
      description: "Update an existing bank account",
      inputSchema: {
        id: z.string().describe("Bank account UUID"),
        name: z.string().optional().describe("New account name"),
      },
    },
    async ({ id, ...fields }) =>
      withClient(getClient, async (client) => {
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            body[key] = value;
          }
        }

        const bankAccount = await updateBankAccount(client, id, body);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(bankAccount, null, 2) }],
        };
      }),
  );

  server.registerTool(
    "account_close",
    {
      description: "Close a bank account",
      inputSchema: {
        id: z.string().describe("Bank account UUID"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        await closeBankAccount(client, id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ closed: true, id }, null, 2) }],
        };
      }),
  );
}
