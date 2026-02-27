// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerLabelTools(
  server: McpServer,
  getClient: () => Promise<HttpClient>,
): void {
  server.tool(
    "label_list",
    "List all labels for the organization",
    {},
    async () =>
      withClient(getClient, async (client) => {
        const response = await client.get<{ labels: unknown[] }>("/v2/labels");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.labels, null, 2) }],
        };
      }),
  );

  server.tool(
    "label_show",
    "Show details of a specific label",
    {
      id: z.string().describe("Label UUID"),
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const response = await client.get<{ label: unknown }>(`/v2/labels/${encodeURIComponent(id)}`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response.label, null, 2) }],
        };
      }),
  );
}
