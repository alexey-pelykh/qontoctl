// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClientInvoice, HttpClient, PaginationMeta } from "@qontoctl/core";
import {
  getClientInvoice,
  createClientInvoice,
  updateClientInvoice,
  deleteClientInvoice,
  finalizeClientInvoice,
  sendClientInvoice,
  markClientInvoicePaid,
  unmarkClientInvoicePaid,
  cancelClientInvoice,
  uploadClientInvoiceFile,
  getClientInvoiceUpload,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

interface PaginatedClientInvoicesResponse {
  readonly client_invoices: readonly ClientInvoice[];
  readonly meta: PaginationMeta;
}

export function registerClientInvoiceTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "client_invoice_list",
    {
      description: "List client invoices with optional filters",
      inputSchema: {
        status: z.enum(["draft", "pending", "paid", "cancelled"]).optional().describe("Filter by status"),
        client_id: z.string().optional().describe("Filter by client ID (UUID)"),
        current_page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const params: Record<string, string> = {};
        if (args.status !== undefined) params["filter[status]"] = args.status;
        if (args.client_id !== undefined) params["filter[client_id]"] = args.client_id;
        if (args.current_page !== undefined) params["current_page"] = String(args.current_page);
        if (args.per_page !== undefined) params["per_page"] = String(args.per_page);

        const response = await client.get<PaginatedClientInvoicesResponse>(
          "/v2/client_invoices",
          Object.keys(params).length > 0 ? params : undefined,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ client_invoices: response.client_invoices, meta: response.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_invoice_show",
    {
      description: "Show details of a specific client invoice",
      inputSchema: {
        id: z.string().describe("Client invoice ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const inv = await getClientInvoice(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(inv, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_invoice_create",
    {
      description: "Create a draft client invoice with client and line items",
      inputSchema: {
        client_id: z.string().describe("Client ID (UUID)"),
        issue_date: z.string().describe("Issue date (YYYY-MM-DD)"),
        due_date: z.string().describe("Due date (YYYY-MM-DD)"),
        currency: z.string().describe("Currency code (ISO 4217)"),
        terms_and_conditions: z.string().describe("Terms and conditions text"),
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
        header: z.string().optional().describe("Header text"),
        footer: z.string().optional().describe("Footer text"),
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
          due_date: args.due_date,
          currency: args.currency,
          terms_and_conditions: args.terms_and_conditions,
          items: args.items,
        };
        if (args.header !== undefined) body["header"] = args.header;
        if (args.footer !== undefined) body["footer"] = args.footer;
        if (args.discount !== undefined) body["discount"] = args.discount;

        const inv = await createClientInvoice(client, body);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(inv, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_invoice_update",
    {
      description: "Update a draft client invoice",
      inputSchema: {
        id: z.string().describe("Client invoice ID (UUID)"),
        issue_date: z.string().optional().describe("Issue date (YYYY-MM-DD)"),
        due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
        currency: z.string().optional().describe("Currency code (ISO 4217)"),
        terms_and_conditions: z.string().optional().describe("Terms and conditions text"),
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

        const inv = await updateClientInvoice(client, id, body);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(inv, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_invoice_delete",
    {
      description: "Delete a draft client invoice",
      inputSchema: {
        id: z.string().describe("Client invoice ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        await deleteClientInvoice(client, id);

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
    "client_invoice_finalize",
    {
      description: "Finalize a client invoice (assign number, transition from draft to pending)",
      inputSchema: {
        id: z.string().describe("Client invoice ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const inv = await finalizeClientInvoice(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(inv, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_invoice_send",
    {
      description: "Send a client invoice to the client via email",
      inputSchema: {
        id: z.string().describe("Client invoice ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        await sendClientInvoice(client, id);

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

  server.registerTool(
    "client_invoice_mark_paid",
    {
      description: "Mark a client invoice as paid",
      inputSchema: {
        id: z.string().describe("Client invoice ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const inv = await markClientInvoicePaid(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(inv, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_invoice_unmark_paid",
    {
      description: "Unmark a client invoice paid status (transition back to pending)",
      inputSchema: {
        id: z.string().describe("Client invoice ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const inv = await unmarkClientInvoicePaid(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(inv, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_invoice_cancel",
    {
      description: "Cancel a finalized client invoice",
      inputSchema: {
        id: z.string().describe("Client invoice ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const inv = await cancelClientInvoice(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(inv, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_invoice_upload",
    {
      description: "Upload a file to a client invoice from the filesystem",
      inputSchema: {
        id: z.string().describe("Client invoice ID (UUID)"),
        file_path: z.string().describe("Absolute path to the file to upload"),
      },
    },
    async ({ id, file_path }) =>
      withClient(getClient, async (client) => {
        const buffer = await readFile(file_path);
        const fileName = basename(file_path);
        const upload = await uploadClientInvoiceFile(client, id, new Blob([buffer]), fileName);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(upload, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "client_invoice_upload_show",
    {
      description: "Show upload details for a client invoice",
      inputSchema: {
        id: z.string().describe("Client invoice ID (UUID)"),
        upload_id: z.string().describe("Upload ID (UUID)"),
      },
    },
    async ({ id, upload_id }) =>
      withClient(getClient, async (client) => {
        const upload = await getClientInvoiceUpload(client, id, upload_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(upload, null, 2),
            },
          ],
        };
      }),
  );
}
