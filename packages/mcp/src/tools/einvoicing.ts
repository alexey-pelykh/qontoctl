// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type HttpClient, getEInvoicingSettings } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerEInvoicingTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "einvoicing_settings",
    { description: "Retrieve e-invoicing settings for the organization" },
    async () =>
      withClient(getClient, async (client) => {
        const settings = await getEInvoicingSettings(client);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(settings, null, 2) }],
        };
      }),
  );
}
