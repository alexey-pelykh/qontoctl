// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CreateIntlTransferParams, HttpClient } from "@qontoctl/core";
import { getIntlTransferRequirements, createIntlTransfer } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerIntlTransferTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "intl_transfer_requirements",
    {
      description: "Get required fields for an international transfer",
      inputSchema: {
        id: z.string().describe("International beneficiary ID (UUID) to get transfer requirements for"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const requirements = await getIntlTransferRequirements(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(requirements, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "intl_transfer_create",
    {
      description: "Create an international transfer",
      inputSchema: {
        beneficiary_id: z.string().describe("International beneficiary ID (UUID)"),
        quote_id: z.string().describe("Quote ID (UUID)"),
        fields: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Additional transfer fields as key-value pairs"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: CreateIntlTransferParams = {
          beneficiary_id: args.beneficiary_id,
          quote_id: args.quote_id,
          ...(args.fields !== undefined ? args.fields : {}),
        };

        const transfer = await createIntlTransfer(client, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(transfer, null, 2),
            },
          ],
        };
      }),
  );
}
