// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  SupplierInvoiceAmountSchema,
  SupplierInvoiceSchema,
  BulkCreateSupplierInvoiceErrorSchema,
  BulkCreateSupplierInvoicesResultSchema,
} from "./schemas.js";

describe("SupplierInvoiceAmountSchema", () => {
  it("parses a valid amount", () => {
    const amount = { value: "99.99", currency: "EUR" };
    expect(SupplierInvoiceAmountSchema.parse(amount)).toEqual(amount);
  });

  it("strips unknown fields", () => {
    const amount = { value: "99.99", currency: "EUR", extra: true };
    const result = SupplierInvoiceAmountSchema.parse(amount);
    expect(result).not.toHaveProperty("extra");
  });

  it("throws on missing required field", () => {
    expect(() => SupplierInvoiceAmountSchema.parse({ value: "99.99" })).toThrow();
  });
});

describe("SupplierInvoiceSchema", () => {
  const validInvoice = {
    id: "si-1",
    organization_id: "org-1",
    status: "pending",
    source_type: "api",
    source: "qontoctl",
    attachment_id: "att-1",
    display_attachment_id: "att-1-display",
    file_name: "invoice.pdf",
    invoice_number: "INV-001",
    supplier_name: "Acme Corp",
    total_amount: { value: "100.00", currency: "EUR" },
    total_amount_excluding_taxes: { value: "83.33", currency: "EUR" },
    total_tax_amount: { value: "16.67", currency: "EUR" },
    payable_amount: { value: "100.00", currency: "EUR" },
    issue_date: "2026-01-15",
    due_date: "2026-02-15",
    payment_date: null,
    scheduled_date: null,
    iban: "FR7630006000011234567890189",
    is_einvoice: false,
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-01-15T10:00:00Z",
  };

  it("parses a valid supplier invoice", () => {
    const result = SupplierInvoiceSchema.parse(validInvoice);
    expect(result).toEqual(validInvoice);
  });

  it("handles nullable fields set to null", () => {
    const invoice = {
      ...validInvoice,
      invoice_number: null,
      supplier_name: null,
      total_amount: null,
      total_amount_excluding_taxes: null,
      total_tax_amount: null,
      payable_amount: null,
      issue_date: null,
      due_date: null,
      iban: null,
    };
    const result = SupplierInvoiceSchema.parse(invoice);
    expect(result.invoice_number).toBeNull();
    expect(result.total_amount).toBeNull();
    expect(result.iban).toBeNull();
  });

  it("strips unknown fields", () => {
    const invoice = { ...validInvoice, extra: true };
    const result = SupplierInvoiceSchema.parse(invoice);
    expect(result).not.toHaveProperty("extra");
  });

  it("throws on missing required field", () => {
    expect(() => SupplierInvoiceSchema.parse({ ...validInvoice, id: undefined })).toThrow();
  });
});

describe("BulkCreateSupplierInvoiceErrorSchema", () => {
  it("parses an error with source", () => {
    const error = { code: "invalid_file", detail: "File too large", source: { pointer: "/data/0/file" } };
    expect(BulkCreateSupplierInvoiceErrorSchema.parse(error)).toEqual(error);
  });

  it("parses an error without source", () => {
    const error = { code: "server_error", detail: "Internal error" };
    expect(BulkCreateSupplierInvoiceErrorSchema.parse(error)).toEqual(error);
  });

  it("parses an error with source without pointer", () => {
    const error = { code: "validation", detail: "Invalid", source: {} };
    expect(BulkCreateSupplierInvoiceErrorSchema.parse(error)).toEqual(error);
  });

  it("strips unknown fields", () => {
    const error = { code: "err", detail: "msg", extra: true };
    const result = BulkCreateSupplierInvoiceErrorSchema.parse(error);
    expect(result).not.toHaveProperty("extra");
  });
});

describe("BulkCreateSupplierInvoicesResultSchema", () => {
  it("parses a successful result", () => {
    const result = {
      supplier_invoices: [
        {
          id: "si-1",
          organization_id: "org-1",
          status: "pending",
          source_type: "api",
          source: "qontoctl",
          attachment_id: "att-1",
          display_attachment_id: "att-1-display",
          file_name: "invoice.pdf",
          invoice_number: null,
          supplier_name: null,
          total_amount: null,
          total_amount_excluding_taxes: null,
          total_tax_amount: null,
          payable_amount: null,
          issue_date: null,
          due_date: null,
          payment_date: null,
          scheduled_date: null,
          iban: null,
          is_einvoice: false,
          created_at: "2026-01-15T10:00:00Z",
          updated_at: "2026-01-15T10:00:00Z",
        },
      ],
      errors: [],
    };
    const parsed = BulkCreateSupplierInvoicesResultSchema.parse(result);
    expect(parsed.supplier_invoices).toHaveLength(1);
    expect(parsed.errors).toHaveLength(0);
  });

  it("parses a result with errors", () => {
    const result = {
      supplier_invoices: [],
      errors: [{ code: "invalid_file", detail: "File too large" }],
    };
    const parsed = BulkCreateSupplierInvoicesResultSchema.parse(result);
    expect(parsed.supplier_invoices).toHaveLength(0);
    expect(parsed.errors).toHaveLength(1);
  });
});
