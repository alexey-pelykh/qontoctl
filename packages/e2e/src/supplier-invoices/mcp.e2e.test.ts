// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  BulkCreateSupplierInvoicesResultSchema,
  SupplierInvoiceListResponseSchema,
  SupplierInvoiceSchema,
} from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

/**
 * Absolute path to the committed PDF fixture used by the bulk-create round-trip.
 * Shared with attachments/insurance/client-invoice E2E.
 */
const PDF_FIXTURE_PATH = resolve(import.meta.dirname, "..", "..", "fixtures", "tiny.pdf");

describe.skipIf(!hasApiKeyCredentials())("MCP supplier invoice tools (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("supplier_invoice_list", () => {
    it("returns a list of supplier invoices with expected structure", async () => {
      const result = await client.callTool({
        name: "supplier_invoice_list",
        arguments: {},
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        supplier_invoices: unknown[];
        meta: Record<string, unknown>;
      };
      SupplierInvoiceListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("supplier_invoices");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.supplier_invoices)).toBe(true);

      for (const item of parsed.supplier_invoices) {
        const invoice = item as Record<string, unknown>;
        expect(invoice).toHaveProperty("id");
        expect(invoice).toHaveProperty("status");
      }
    });
  });

  describe("supplier_invoice_show", () => {
    it("returns details for a specific supplier invoice", async () => {
      const listResult = await client.callTool({
        name: "supplier_invoice_list",
        arguments: {},
      });
      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        supplier_invoices: { id: string }[];
      };
      if (listParsed.supplier_invoices.length === 0) {
        return; // No supplier invoices available
      }

      const firstInvoice = listParsed.supplier_invoices[0];
      expect(firstInvoice).toBeDefined();
      const invoiceId = (firstInvoice as { id: string }).id;

      const result = await client.callTool({
        name: "supplier_invoice_show",
        arguments: { id: invoiceId },
      });

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      SupplierInvoiceSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", invoiceId);
      expect(parsed).toHaveProperty("status");
    });
  });

  // Multipart bulk upload + per-invoice retrieval round-trip against the live
  // sandbox — closes the audit gap from umbrella #449 (Group 4d): the
  // bulk-create write path (POST /v2/supplier_invoices/bulk) was fully
  // implemented but uncovered by E2E. The PDF fixture
  // (`packages/e2e/fixtures/tiny.pdf`) is shared with attachment/insurance/
  // client-invoice E2E (landed with #G4A).
  //
  // **Accepted state pollution**: qontoctl exposes no DELETE endpoint for
  // supplier invoices, so bulk-uploaded fixtures accumulate in the sandbox
  // organization. This is documented as accepted per AC #4 of #456.
  describe("supplier_invoice_bulk_create", () => {
    it("uploads N=2 PDFs via multipart and asserts each is queryable", async () => {
      // Upload the same fixture twice — the MCP tool assigns a fresh random
      // idempotency key per file (see packages/mcp/src/tools/supplier-invoice.ts),
      // so the API creates two distinct supplier invoices from one file path.
      const result = await client.callTool({
        name: "supplier_invoice_bulk_create",
        arguments: { file_paths: [PDF_FIXTURE_PATH, PDF_FIXTURE_PATH] },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      BulkCreateSupplierInvoicesResultSchema.parse(parsed);

      const created = parsed["supplier_invoices"] as Record<string, unknown>[];
      const errors = parsed["errors"] as unknown[];
      expect(Array.isArray(created)).toBe(true);
      expect(created.length).toBe(2);
      expect(Array.isArray(errors)).toBe(true);
      expect(errors.length).toBe(0);

      for (const invoice of created) {
        expect(invoice).toHaveProperty("id");
        expect(typeof invoice["id"]).toBe("string");
        expect(invoice).toHaveProperty("status");
        expect(invoice).toHaveProperty("file_name", "tiny.pdf");
      }

      // Assert each returned invoice is queryable via `supplier_invoice_show`.
      for (const invoice of created) {
        const invoiceId = invoice["id"] as string;
        const showResult = await client.callTool({
          name: "supplier_invoice_show",
          arguments: { id: invoiceId },
        });
        expect(showResult.isError).toBeFalsy();
        const fetched = JSON.parse(firstTextFromMcpResult(showResult)) as Record<string, unknown>;
        SupplierInvoiceSchema.parse(fetched);
        expect(fetched).toHaveProperty("id", invoiceId);
        expect(fetched).toHaveProperty("file_name", "tiny.pdf");
        expect(fetched).toHaveProperty("status");
      }
    });
  });
});
