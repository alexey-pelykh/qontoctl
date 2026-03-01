// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CreditNote, HttpClient, PaginationMeta } from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedCreditNotesResponse {
  readonly credit_notes: readonly CreditNote[];
  readonly meta: PaginationMeta;
}

interface SingleCreditNoteResponse {
  readonly credit_note: CreditNote;
}

export function registerCreditNoteTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "credit_note_list",
    {
      description: "List credit notes in the organization",
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

        const response = await client.get<PaginatedCreditNotesResponse>(
          "/v2/credit_notes",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ credit_notes: response.credit_notes, meta: response.meta }, null, 2),
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
        const response = await client.get<SingleCreditNoteResponse>(`/v2/credit_notes/${encodeURIComponent(id)}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response.credit_note, null, 2),
            },
          ],
        };
      }),
  );
}
