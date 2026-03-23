// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CreateIntlBeneficiaryParams, HttpClient, UpdateIntlBeneficiaryParams } from "@qontoctl/core";
import {
  listIntlBeneficiaries,
  getIntlBeneficiaryRequirements,
  createIntlBeneficiary,
  updateIntlBeneficiary,
  removeIntlBeneficiary,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerIntlBeneficiaryTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "intl_beneficiary_list",
    {
      description: "List international beneficiaries in the organization",
      inputSchema: {
        current_page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const result = await listIntlBeneficiaries(client, {
          ...(args.current_page !== undefined ? { current_page: args.current_page } : {}),
          ...(args.per_page !== undefined ? { per_page: args.per_page } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { international_beneficiaries: result.international_beneficiaries, meta: result.meta },
                null,
                2,
              ),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "intl_beneficiary_requirements",
    {
      description: "Get required fields for an international beneficiary corridor",
      inputSchema: {
        id: z.string().describe("International beneficiary ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const requirements = await getIntlBeneficiaryRequirements(client, id);

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
    "intl_beneficiary_add",
    {
      description: "Create a new international beneficiary",
      inputSchema: {
        country: z.string().describe("Country code (ISO 3166-1 alpha-2)"),
        currency: z.string().describe("Currency code (ISO 4217)"),
        fields: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Additional beneficiary fields as key-value pairs"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: CreateIntlBeneficiaryParams = {
          country: args.country,
          currency: args.currency,
          ...(args.fields !== undefined ? args.fields : {}),
        };

        const beneficiary = await createIntlBeneficiary(client, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(beneficiary, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "intl_beneficiary_update",
    {
      description: "Update an international beneficiary",
      inputSchema: {
        id: z.string().describe("International beneficiary ID (UUID)"),
        fields: z.record(z.string(), z.unknown()).describe("Fields to update as key-value pairs"),
      },
    },
    async ({ id, fields }) =>
      withClient(getClient, async (client) => {
        const params: UpdateIntlBeneficiaryParams = { ...fields };

        const beneficiary = await updateIntlBeneficiary(client, id, params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(beneficiary, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "intl_beneficiary_remove",
    {
      description: "Remove an international beneficiary",
      inputSchema: {
        id: z.string().describe("International beneficiary ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        await removeIntlBeneficiary(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ removed: true, id }, null, 2),
            },
          ],
        };
      }),
  );
}
