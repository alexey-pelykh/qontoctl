// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import { parseResponse, QuoteResponseSchema, QuoteListResponseSchema } from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerQuoteTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "quote_list",
    {
      description: "List quotes with optional filters",
      inputSchema: {
        status: z.enum(["pending_approval", "approved", "canceled"]).optional().describe("Filter by status"),
        created_at_from: z.string().optional().describe("Filter by creation date start (ISO 8601)"),
        created_at_to: z.string().optional().describe("Filter by creation date end (ISO 8601)"),
        sort_by: z
          .enum(["created_at:asc", "created_at:desc"])
          .optional()
          .describe("Sort order (default: created_at:desc)"),
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (args.status !== undefined) params["filter[status]"] = args.status;
        if (args.created_at_from !== undefined) params["filter[created_at_from]"] = args.created_at_from;
        if (args.created_at_to !== undefined) params["filter[created_at_to]"] = args.created_at_to;
        if (args.sort_by !== undefined) params["sort_by"] = args.sort_by;
        if (args.page !== undefined) params["page"] = String(args.page);
        if (args.per_page !== undefined) params["per_page"] = String(args.per_page);

        const endpointPath = "/v2/quotes";
        const response = await client.get(endpointPath, Object.keys(params).length > 0 ? params : undefined);
        const result = parseResponse(QuoteListResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ quotes: result.quotes, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "quote_show",
    {
      description: "Show details of a specific quote",
      inputSchema: {
        id: z.string().describe("Quote ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const endpointPath = `/v2/quotes/${encodeURIComponent(id)}`;
        const response = await client.get(endpointPath);
        const result = parseResponse(QuoteResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.quote, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "quote_create",
    {
      description: "Create a new quote with client and line items",
      inputSchema: {
        client_id: z.string().describe("Client ID (UUID)"),
        issue_date: z.string().describe("Issue date (YYYY-MM-DD)"),
        expiry_date: z.string().describe("Expiry date (YYYY-MM-DD)"),
        currency: z.string().describe("Currency code (ISO 4217)"),
        terms_and_conditions: z.string().describe("Terms and conditions text (max 3000 chars)"),
        items: z
          .array(
            z.object({
              title: z.string().describe("Item title"),
              quantity: z.string().describe("Quantity as decimal string"),
              unit_price: z.object({
                value: z.string().describe("Unit price value"),
                currency: z.string().describe("Currency code"),
              }),
              vat_rate: z.string().describe("VAT rate percentage"),
              description: z.string().optional().describe("Item description"),
              unit: z.string().optional().describe("Measurement unit"),
            }),
          )
          .describe("Line items (minimum 1)"),
        number: z.string().optional().describe("Quote number (max 40 chars, must be unique)"),
        header: z.string().optional().describe("Header text (max 1000 chars)"),
        footer: z.string().optional().describe("Footer text (max 1000 chars)"),
        discount: z
          .object({
            type: z.enum(["percentage", "amount"]).describe("Discount type"),
            value: z.string().describe("Discount value"),
          })
          .optional()
          .describe("Global discount"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const body: Record<string, unknown> = {
          client_id: args.client_id,
          issue_date: args.issue_date,
          expiry_date: args.expiry_date,
          currency: args.currency,
          terms_and_conditions: args.terms_and_conditions,
          items: args.items,
        };
        if (args.number !== undefined) body["number"] = args.number;
        if (args.header !== undefined) body["header"] = args.header;
        if (args.footer !== undefined) body["footer"] = args.footer;
        if (args.discount !== undefined) body["discount"] = args.discount;

        const endpointPath = "/v2/quotes";
        const response = await client.post(endpointPath, body);
        const result = parseResponse(QuoteResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.quote, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "quote_update",
    {
      description: "Update an existing quote",
      inputSchema: {
        id: z.string().describe("Quote ID (UUID)"),
        issue_date: z.string().optional().describe("Issue date (YYYY-MM-DD)"),
        expiry_date: z.string().optional().describe("Expiry date (YYYY-MM-DD)"),
        currency: z.string().optional().describe("Currency code (ISO 4217)"),
        terms_and_conditions: z.string().optional().describe("Terms and conditions text"),
        number: z.string().optional().describe("Quote number"),
        header: z.string().optional().describe("Header text"),
        footer: z.string().optional().describe("Footer text"),
        items: z
          .array(
            z.object({
              title: z.string().describe("Item title"),
              quantity: z.string().describe("Quantity"),
              unit_price: z.object({
                value: z.string().describe("Unit price value"),
                currency: z.string().describe("Currency code"),
              }),
              vat_rate: z.string().describe("VAT rate percentage"),
              description: z.string().optional().describe("Item description"),
              unit: z.string().optional().describe("Measurement unit"),
            }),
          )
          .optional()
          .describe("Updated line items"),
        discount: z
          .object({
            type: z.enum(["percentage", "amount"]).describe("Discount type"),
            value: z.string().describe("Discount value"),
          })
          .optional()
          .describe("Global discount"),
      },
    },
    async ({ id, ...fields }) =>
      withClient(getClient, async (client) => {
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            body[key] = value;
          }
        }

        const endpointPath = `/v2/quotes/${encodeURIComponent(id)}`;
        const response = await client.patch(endpointPath, body);
        const result = parseResponse(QuoteResponseSchema, response, endpointPath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.quote, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "quote_delete",
    {
      description: "Delete a quote",
      inputSchema: {
        id: z.string().describe("Quote ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        await client.delete(`/v2/quotes/${encodeURIComponent(id)}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ deleted: true, id }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "quote_send",
    {
      description: "Send a quote to the client via email",
      inputSchema: {
        id: z.string().describe("Quote ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        await client.requestVoid("POST", `/v2/quotes/${encodeURIComponent(id)}/send`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ sent: true, id }, null, 2),
            },
          ],
        };
      }),
  );
}
