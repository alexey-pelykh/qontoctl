// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { parseResponse, CreditNoteResponseSchema, CreditNoteListResponseSchema } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerCreditNoteTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "credit_note_list",
    {
      description: "List credit notes in the organization",
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

        const endpointPath = "/v2/credit_notes";
        const response = await client.get(endpointPath, Object.keys(params).length > 0 ? params : undefined);
        const result = parseResponse(CreditNoteListResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ credit_notes: result.credit_notes, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "credit_note_show",
    {
      description: "Show details of a specific credit note",
      inputSchema: {
        id: z.string().describe("Credit note ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const endpointPath = `/v2/credit_notes/${encodeURIComponent(id)}`;
        const response = await client.get(endpointPath);
        const result = parseResponse(CreditNoteResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.credit_note, null, 2),
            },
          ],
        };
      }),
  );
}
