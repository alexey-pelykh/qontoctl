// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CreateBeneficiaryParams, HttpClient, UpdateBeneficiaryParams } from "@qontoctl/core";
import {
  getBeneficiary,
  listBeneficiaries,
  createBeneficiary,
  updateBeneficiary,
  trustBeneficiaries,
  untrustBeneficiaries,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerBeneficiaryTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "beneficiary_list",
    {
      description: "List SEPA beneficiaries in the organization",
      inputSchema: {
        status: z.enum(["pending", "validated", "declined"]).optional().describe("Filter by status"),
        trusted: z.boolean().optional().describe("Filter by trust status"),
        iban: z.string().optional().describe("Filter by IBAN"),
        updated_at_from: z.string().optional().describe("Updated from date (ISO 8601)"),
        updated_at_to: z.string().optional().describe("Updated to date (ISO 8601)"),
        sort_by: z.string().optional().describe("Sort order (e.g. updated_at:desc)"),
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const result = await listBeneficiaries(client, {
          ...(args.status !== undefined ? { status: [args.status] } : {}),
          ...(args.trusted !== undefined ? { trusted: args.trusted } : {}),
          ...(args.iban !== undefined ? { iban: [args.iban] } : {}),
          ...(args.updated_at_from !== undefined ? { updated_at_from: args.updated_at_from } : {}),
          ...(args.updated_at_to !== undefined ? { updated_at_to: args.updated_at_to } : {}),
          ...(args.sort_by !== undefined ? { sort_by: args.sort_by } : {}),
          ...(args.page !== undefined ? { page: args.page } : {}),
          ...(args.per_page !== undefined ? { per_page: args.per_page } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ beneficiaries: result.beneficiaries, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "beneficiary_show",
    {
      description: "Show details of a specific SEPA beneficiary",
      inputSchema: {
        id: z.string().describe("Beneficiary ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const beneficiary = await getBeneficiary(client, id);

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
    "beneficiary_add",
    {
      description: "Create a new SEPA beneficiary",
      inputSchema: {
        name: z.string().describe("Beneficiary name"),
        iban: z.string().describe("IBAN"),
        bic: z.string().optional().describe("BIC/SWIFT code"),
        email: z.string().optional().describe("Email address"),
        activity_tag: z.string().optional().describe("Activity tag"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: CreateBeneficiaryParams = {
          name: args.name,
          iban: args.iban,
          ...(args.bic !== undefined ? { bic: args.bic } : {}),
          ...(args.email !== undefined ? { email: args.email } : {}),
          ...(args.activity_tag !== undefined ? { activity_tag: args.activity_tag } : {}),
        };

        const beneficiary = await createBeneficiary(client, params);

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
    "beneficiary_update",
    {
      description: "Update an existing SEPA beneficiary",
      inputSchema: {
        id: z.string().describe("Beneficiary ID (UUID)"),
        name: z.string().optional().describe("Beneficiary name"),
        iban: z.string().optional().describe("IBAN"),
        bic: z.string().optional().describe("BIC/SWIFT code"),
        email: z.string().optional().describe("Email address"),
        activity_tag: z.string().optional().describe("Activity tag"),
      },
    },
    async ({ id, ...fields }) =>
      withClient(getClient, async (client) => {
        const params: UpdateBeneficiaryParams = {
          ...(fields.name !== undefined ? { name: fields.name } : {}),
          ...(fields.iban !== undefined ? { iban: fields.iban } : {}),
          ...(fields.bic !== undefined ? { bic: fields.bic } : {}),
          ...(fields.email !== undefined ? { email: fields.email } : {}),
          ...(fields.activity_tag !== undefined ? { activity_tag: fields.activity_tag } : {}),
        };

        const beneficiary = await updateBeneficiary(client, id, params);

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
    "beneficiary_trust",
    {
      description:
        "Trust one or more SEPA beneficiaries (requires Embed-partner-only `beneficiary.trust` OAuth scope; standard third-party apps will receive 403)",
      inputSchema: {
        ids: z.array(z.string()).min(1).describe("Beneficiary IDs to trust"),
      },
    },
    async ({ ids }) =>
      withClient(getClient, async (client) => {
        await trustBeneficiaries(client, ids);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ trusted: true, ids }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "beneficiary_untrust",
    {
      description:
        "Untrust one or more SEPA beneficiaries (requires Embed-partner-only `beneficiary.trust` OAuth scope; standard third-party apps will receive 403)",
      inputSchema: {
        ids: z.array(z.string()).min(1).describe("Beneficiary IDs to untrust"),
      },
    },
    async ({ ids }) =>
      withClient(getClient, async (client) => {
        await untrustBeneficiaries(client, ids);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ untrusted: true, ids }, null, 2),
            },
          ],
        };
      }),
  );
}
