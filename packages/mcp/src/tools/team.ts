// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient, PaginationMeta, Team } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedTeamsResponse {
  readonly teams: readonly Team[];
  readonly meta: PaginationMeta;
}

export function registerTeamTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "team_list",
    {
      description: "List all teams in the organization",
      inputSchema: {
        current_page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async ({ current_page, per_page }) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (current_page !== undefined) params["current_page"] = String(current_page);
        if (per_page !== undefined) params["per_page"] = String(per_page);

        const response = await client.get<PaginatedTeamsResponse>(
          "/v2/teams",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ teams: response.teams, meta: response.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "team_create",
    {
      description: "Create a new team in the organization",
      inputSchema: {
        name: z.string().min(2).max(100).describe("Name for the new team (2-100 characters)"),
      },
    },
    async ({ name }) =>
      withClient(getClient, async (client) => {
        const response = await client.post<{ team: Team }>("/v2/teams", { name });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response.team, null, 2),
            },
          ],
        };
      }),
  );
}
