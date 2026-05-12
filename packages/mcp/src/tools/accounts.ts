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
import { coreOptionsFromContext, executeWithMcpSca, scaContinuationSchema, scaOptionsFromArgs } from "../sca.js";

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
      description:
        "Create a new bank account. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        name: z.string().describe("Account name"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) => createBankAccount(client, { name: args.name }, coreOptionsFromContext(context)),
          (bankAccount) => ({
            content: [{ type: "text" as const, text: JSON.stringify(bankAccount, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );

  server.registerTool(
    "account_update",
    {
      description:
        "Update an existing bank account. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Bank account UUID"),
        name: z.string().optional().describe("New account name"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body["name"] = args.name;

        return executeWithMcpSca(
          client,
          (context) => updateBankAccount(client, args.id, body, coreOptionsFromContext(context)),
          (bankAccount) => ({
            content: [{ type: "text" as const, text: JSON.stringify(bankAccount, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        );
      }),
  );

  server.registerTool(
    "account_close",
    {
      description:
        "Close a bank account. SCA: this operation may require Strong Customer Authentication; the tool polls inline by default (wait=30s) and falls back to a structured pending response so the caller can continue via sca_session_show + sca_session_token.",
      inputSchema: {
        id: z.string().describe("Bank account UUID"),
        ...scaContinuationSchema,
      },
    },
    async (args) =>
      withClient(getClient, async (client) =>
        executeWithMcpSca(
          client,
          (context) => closeBankAccount(client, args.id, coreOptionsFromContext(context)),
          () => ({
            content: [{ type: "text" as const, text: JSON.stringify({ closed: true, id: args.id }, null, 2) }],
          }),
          scaOptionsFromArgs(args),
        ),
      ),
  );
}
