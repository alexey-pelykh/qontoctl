// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient, Membership } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedMembershipsResponse {
  readonly memberships: readonly Membership[];
  readonly meta: {
    readonly current_page: number;
    readonly next_page: number | null;
    readonly prev_page: number | null;
    readonly total_pages: number;
    readonly total_count: number;
    readonly per_page: number;
  };
}

export function registerMembershipTools(
  server: McpServer,
  getClient: () => Promise<HttpClient>,
): void {
  server.tool(
    "membership_list",
    "List all memberships in the organization",
    {
      page: z.number().int().positive().optional().describe("Page number"),
      per_page: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe("Items per page (max 100)"),
    },
    async ({ page, per_page }) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (page !== undefined) params["current_page"] = String(page);
        if (per_page !== undefined) params["per_page"] = String(per_page);

        const response = await client.get<PaginatedMembershipsResponse>(
          "/v2/memberships",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { memberships: response.memberships, meta: response.meta },
                null,
                2,
              ),
            },
          ],
        };
      }),
  );
}
