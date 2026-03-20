// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type HttpClient,
  getSupplierInvoice,
  listSupplierInvoices,
  bulkCreateSupplierInvoices,
  type BulkCreateSupplierInvoiceEntry,
} from "@qontoctl/core";
import { withClient } from "../errors.js";

export function registerSupplierInvoiceTools(server: McpServer, getClient: () => Promise<HttpClient>): void {
  server.registerTool(
    "supplier_invoice_list",
    {
      description: "List supplier invoices with optional filters",
      inputSchema: {
        status: z
          .enum([
            "to_review",
            "to_approve",
            "awaiting_payment",
            "pending",
            "scheduled",
            "paid",
            "archived",
            "rejected",
            "discarded",
          ])
          .optional()
          .describe("Filter by status"),
        due_date: z
          .enum(["past_and_today", "future", "missing_date"])
          .optional()
          .describe("Filter by due date category"),
        query: z.string().optional().describe("Full-text search query"),
        sort_by: z.string().optional().describe("Sort order (e.g. created_at:desc)"),
        current_page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const result = await listSupplierInvoices(client, {
          ...(args.status !== undefined ? { status: [args.status] } : {}),
          ...(args.due_date !== undefined ? { due_date: args.due_date } : {}),
          ...(args.query !== undefined ? { query: args.query } : {}),
          ...(args.sort_by !== undefined ? { sort_by: args.sort_by } : {}),
          ...(args.current_page !== undefined ? { current_page: args.current_page } : {}),
          ...(args.per_page !== undefined ? { per_page: args.per_page } : {}),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ supplier_invoices: result.supplier_invoices, meta: result.meta }, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "supplier_invoice_show",
    {
      description: "Show details of a specific supplier invoice",
      inputSchema: {
        id: z.string().describe("Supplier invoice ID (UUID)"),
      },
    },
    async ({ id }) =>
      withClient(getClient, async (client) => {
        const supplierInvoice = await getSupplierInvoice(client, id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(supplierInvoice, null, 2),
            },
          ],
        };
      }),
  );

  server.registerTool(
    "supplier_invoice_bulk_create",
    {
      description: "Create supplier invoices by uploading files from the filesystem",
      inputSchema: {
        file_paths: z.array(z.string()).min(1).describe("Absolute paths to invoice files (PDF, PNG, JPG)"),
      },
    },
    async ({ file_paths }) =>
      withClient(getClient, async (client) => {
        const entries: BulkCreateSupplierInvoiceEntry[] = [];
        for (const filePath of file_paths) {
          const buffer = await readFile(filePath);
          entries.push({
            file: new Blob([buffer]),
            fileName: basename(filePath),
            idempotencyKey: randomUUID(),
          });
        }

        const result = await bulkCreateSupplierInvoices(client, entries);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  supplier_invoices: result.supplier_invoices,
                  errors: result.errors,
                },
                null,
                2,
              ),
            },
          ],
        };
      }),
  );
}
