// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Beneficiary, HttpClient, PaginationMeta } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedBeneficiariesResponse {
  readonly beneficiaries: readonly Beneficiary[];
  readonly meta: PaginationMeta;
}

interface SingleBeneficiaryResponse {
  readonly beneficiary: Beneficiary;
}

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
        current_page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};

        if (args.status !== undefined) params["status[]"] = args.status;
        if (args.trusted !== undefined) params["trusted"] = String(args.trusted);
        if (args.iban !== undefined) params["iban[]"] = args.iban;
        if (args.updated_at_from !== undefined) params["updated_at_from"] = args.updated_at_from;
        if (args.updated_at_to !== undefined) params["updated_at_to"] = args.updated_at_to;
        if (args.sort_by !== undefined) params["sort_by"] = args.sort_by;
        if (args.current_page !== undefined) params["current_page"] = String(args.current_page);
        if (args.per_page !== undefined) params["per_page"] = String(args.per_page);

        const response = await client.get<PaginatedBeneficiariesResponse>(
          "/v2/sepa/beneficiaries",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ beneficiaries: response.beneficiaries, meta: response.meta }, null, 2),
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
        const response = await client.get<SingleBeneficiaryResponse>(
          `/v2/sepa/beneficiaries/${encodeURIComponent(id)}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response.beneficiary, null, 2),
            },
          ],
        };
      }),
  );
}
