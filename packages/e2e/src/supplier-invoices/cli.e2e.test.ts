// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { SupplierInvoiceSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

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
});
