// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerMembershipTools(
  server: McpServer,
  getClient: () => Promise<HttpClient>,
): void {
  server.tool(
    "membership_list",
    "List all memberships for the organization",
    {},
    async () =>
      withClient(getClient, async (client) => {
        const response = await client.get<{ memberships: unknown[]; meta: unknown }>(
          "/v2/memberships",
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
