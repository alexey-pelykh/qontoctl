// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { SupplierInvoiceSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

/**
 * Absolute path to the committed PDF fixture used by the bulk-create round-trip.
 * Shared with attachments/insurance/client-invoice E2E.
 */
const PDF_FIXTURE_PATH = resolve(import.meta.dirname, "..", "..", "fixtures", "tiny.pdf");

describe.skipIf(!hasApiKeyCredentials())("supplier-invoice commands (e2e)", () => {
  describe("supplier-invoice list", () => {
    it("lists supplier invoices", () => {
      const output = cli("supplier-invoice", "list");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "supplier-invoice", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const item of parsed) {
        const invoice = item as Record<string, unknown>;
        expect(invoice).toHaveProperty("id");
        expect(invoice).toHaveProperty("status");
      }
    });

    it("supports --status filter", () => {
      const output = cli("--output", "json", "supplier-invoice", "list", "--status", "paid");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("supplier-invoice show", () => {
    it("shows supplier invoice details", () => {
      const listOutput = cli("--output", "json", "supplier-invoice", "list");
      const invoices = JSON.parse(listOutput) as { id: string }[];
      if (invoices.length === 0) {
        return; // No supplier invoices available
      }

      const firstInvoice = invoices[0];
      expect(firstInvoice).toBeDefined();
      const invoiceId = (firstInvoice as { id: string }).id;
      const output = cli("--output", "json", "supplier-invoice", "show", invoiceId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
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
  describe("supplier-invoice bulk-create", () => {
    it("uploads N=2 PDFs via multipart and asserts each is queryable", () => {
      // Upload the same fixture twice — the CLI assigns a fresh random
      // idempotency key per file (see packages/cli/src/commands/supplier-invoice/bulk-create.ts),
      // so the API creates two distinct supplier invoices from one file path.
      const output = cli("--output", "json", "supplier-invoice", "bulk-create", PDF_FIXTURE_PATH, PDF_FIXTURE_PATH);
      // With `--output json`, the CLI emits the `supplier_invoices` array directly
      // (errors are written to stderr; a non-empty errors array sets exit code 1
      // which would cause `cli()` to throw).
      const created = JSON.parse(output) as Record<string, unknown>[];
      expect(Array.isArray(created)).toBe(true);
      expect(created.length).toBe(2);

      for (const invoice of created) {
        SupplierInvoiceSchema.parse(invoice);
        expect(invoice).toHaveProperty("id");
        expect(typeof invoice["id"]).toBe("string");
        expect(invoice).toHaveProperty("status");
        expect(invoice).toHaveProperty("file_name", "tiny.pdf");
      }

      // Assert each returned invoice is queryable via `supplier-invoice show`.
      for (const invoice of created) {
        const invoiceId = invoice["id"] as string;
        const showOutput = cli("--output", "json", "supplier-invoice", "show", invoiceId);
        const fetched = JSON.parse(showOutput) as Record<string, unknown>;
        SupplierInvoiceSchema.parse(fetched);
        expect(fetched).toHaveProperty("id", invoiceId);
        expect(fetched).toHaveProperty("file_name", "tiny.pdf");
        expect(fetched).toHaveProperty("status");
      }
    });
  });
});
