// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerOrgTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.tool("org_show", "Show organization details including name, slug, and bank accounts", {}, async () =>
    withClient(getClient, async (client) => {
      const response = await client.get<{ organization: unknown }>("/v2/organization");
      return {
        content: [{ type: "text" as const, text: JSON.stringify(response.organization, null, 2) }],
      };
    }),
  );
}
