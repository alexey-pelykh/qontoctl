// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { parseResponse, MembershipResponseSchema, MembershipListResponseSchema } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerMembershipTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "membership_list",
    {
      description: "List all memberships in the organization",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async ({ page, per_page }) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (page !== undefined) params["page"] = String(page);
        if (per_page !== undefined) params["per_page"] = String(per_page);

        const endpointPath = "/v2/memberships";
        const response = await client.get(endpointPath, Object.keys(params).length > 0 ? params : undefined);
        const result = parseResponse(MembershipListResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ memberships: result.memberships, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "membership_show",
    {
      description: "Show the current authenticated user's membership",
      inputSchema: {},
    },
    async () =>
      withClient(getClient, async (client) => {
        const endpointPath = "/v2/membership";
        const response = await client.get(endpointPath);
        const result = parseResponse(MembershipResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.membership, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "membership_invite",
    {
      description: "Invite a new member to the organization",
      inputSchema: {
        email: z.string().describe("Email address of the invitee"),
        role: z.enum(["admin", "manager", "reporting", "employee", "accountant"]).describe("Role for the new member"),
        first_name: z.string().optional().describe("First name"),
        last_name: z.string().optional().describe("Last name"),
        team_id: z.string().optional().describe("Team ID"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const body: Record<string, string> = {
          email: args.email,
          role: args.role,
        };
        if (args.first_name !== undefined) body["first_name"] = args.first_name;
        if (args.last_name !== undefined) body["last_name"] = args.last_name;
        if (args.team_id !== undefined) body["team_id"] = args.team_id;

        const endpointPath = "/v2/memberships";
        const response = await client.post(endpointPath, { membership: body });
        const result = parseResponse(MembershipResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.membership, null, 2),
            },
          ],
        };
      }),
  );
}
