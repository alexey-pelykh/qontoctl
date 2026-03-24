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
        attachment_id: z.string().optional().describe("Filter by single attachment ID"),
        attachment_ids: z.array(z.string()).optional().describe("Filter by multiple attachment IDs"),
        payment_date: z.string().optional().describe("Filter by payment date"),
        issue_date: z.string().optional().describe("Filter by issue date"),
        issue_date_from: z.string().optional().describe("Filter by issue date start (ISO 8601)"),
        missing_data: z.boolean().optional().describe("Filter invoices with missing data"),
        matched_transactions: z.boolean().optional().describe("Filter by matched transactions"),
        document_type: z.string().optional().describe("Filter by document type"),
        approver_ids: z.array(z.string()).optional().describe("Filter by approver IDs"),
        exclude_credit_notes: z.boolean().optional().describe("Exclude credit notes"),
        payable_amount: z.string().optional().describe("Filter by payable amount"),
        query: z.string().optional().describe("Full-text search query"),
        query_fields: z.string().optional().describe("Fields to search in (top-level query param)"),
        sort_by: z.string().optional().describe("Sort order (e.g. created_at:desc)"),
        page: z.number().int().positive().optional().describe("Page number"),
        per_page: z.number().int().positive().max(100).optional().describe("Items per page (max 100)"),
      },
    },
    async (args) =>
      withClient(getClient, async (client) => {
        const result = await listSupplierInvoices(client, {
          ...(args.status !== undefined ? { status: [args.status] } : {}),
          ...(args.due_date !== undefined ? { due_date: args.due_date } : {}),
          ...(args.attachment_id !== undefined ? { attachment_id: args.attachment_id } : {}),
          ...(args.attachment_ids !== undefined ? { attachment_ids: args.attachment_ids } : {}),
          ...(args.payment_date !== undefined ? { payment_date: args.payment_date } : {}),
          ...(args.issue_date !== undefined ? { issue_date: args.issue_date } : {}),
          ...(args.issue_date_from !== undefined ? { issue_date_from: args.issue_date_from } : {}),
          ...(args.missing_data !== undefined ? { missing_data: args.missing_data } : {}),
          ...(args.matched_transactions !== undefined ? { matched_transactions: args.matched_transactions } : {}),
          ...(args.document_type !== undefined ? { document_type: args.document_type } : {}),
          ...(args.approver_ids !== undefined ? { approver_ids: args.approver_ids } : {}),
          ...(args.exclude_credit_notes !== undefined ? { exclude_credit_notes: args.exclude_credit_notes } : {}),
          ...(args.payable_amount !== undefined ? { payable_amount: args.payable_amount } : {}),
          ...(args.query !== undefined ? { query: args.query } : {}),
          ...(args.query_fields !== undefined ? { query_fields: args.query_fields } : {}),
          ...(args.sort_by !== undefined ? { sort_by: args.sort_by } : {}),
          ...(args.page !== undefined ? { page: args.page } : {}),
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
