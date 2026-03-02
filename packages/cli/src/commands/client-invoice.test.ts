// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createClientInvoiceCommand } from "./client-invoice.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

const sampleInvoice = {
  id: "inv-123",
  organization_id: "org-1",
  invoice_number: "INV-001",
  status: "draft",
  client_id: "cl-123",
  currency: "EUR",
  total_amount: { value: "120.00", currency: "EUR" },
  total_amount_cents: 12000,
  vat_amount: { value: "20.00", currency: "EUR" },
  vat_amount_cents: 2000,
  issue_date: "2026-01-15",
  due_date: "2026-02-15",
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
  attachment_id: null,
  contact_email: null,
  terms_and_conditions: "Net 30",
  header: null,
  footer: null,
  discount: null,
  items: [
    {
      title: "Service",
      description: null,
      quantity: "1",
      unit: null,
      vat_rate: "20",
      vat_exemption_reason: null,
      unit_price: { value: "100.00", currency: "EUR" },
      unit_price_cents: 10000,
      total_amount: { value: "120.00", currency: "EUR" },
      total_amount_cents: 12000,
      total_vat: { value: "20.00", currency: "EUR" },
      total_vat_cents: 2000,
      subtotal: { value: "100.00", currency: "EUR" },
      subtotal_cents: 10000,
      discount: null,
    },
  ],
  client: {
    id: "cl-123",
    type: "company",
    name: "Acme Corp",
    first_name: null,
    last_name: null,
    email: "contact@acme.com",
    vat_number: null,
    tax_identification_number: null,
    address: null,
    city: null,
    zip_code: null,
    province_code: null,
    country_code: "FR",
    recipient_code: null,
    locale: null,
    billing_address: null,
    delivery_address: null,
  },
};

const sampleUpload = {
  id: "upl-456",
  file_name: "invoice.pdf",
  file_size: 12345,
  file_content_type: "application/pdf",
  url: "https://example.com/invoice.pdf",
  created_at: "2026-01-15T10:00:00Z",
};

describe("client-invoice commands", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("client-invoice list", () => {
    it("lists invoices in table format", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          client_invoices: [sampleInvoice],
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 1,
            per_page: 100,
          },
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["client-invoice", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("inv-123");
      expect(output).toContain("Acme Corp");
    });

    it("lists invoices in json format", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          client_invoices: [sampleInvoice],
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 1,
            per_page: 100,
          },
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client-invoice", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      const first = parsed[0] as Record<string, unknown>;
      expect(first).toHaveProperty("id", "inv-123");
      expect(first).toHaveProperty("status", "draft");
    });
  });

  describe("client-invoice show", () => {
    it("shows invoice details in json format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client-invoice", "show", "inv-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "inv-123");
      expect(parsed).toHaveProperty("status", "draft");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["client-invoice", "show", "inv-123"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/client_invoices/inv-123");
    });
  });

  describe("client-invoice create", () => {
    it("creates an invoice in json format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      const body = JSON.stringify({ client_id: "cl-123", items: [] });
      await program.parseAsync(["--output", "json", "client-invoice", "create", "--body", body], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "inv-123");
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      const body = JSON.stringify({ client_id: "cl-123" });
      await program.parseAsync(["client-invoice", "create", "--body", body], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices");
      expect(opts.method).toBe("POST");
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      const body = JSON.stringify({ client_id: "cl-123" });
      await program.parseAsync(["client-invoice", "create", "--body", body, "--idempotency-key", "key-abc-123"], {
        from: "user",
      });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-abc-123");
    });
  });

  describe("client-invoice update", () => {
    it("updates an invoice in json format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      const body = JSON.stringify({ header: "Updated" });
      await program.parseAsync(["--output", "json", "client-invoice", "update", "inv-123", "--body", body], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "inv-123");
    });

    it("sends PATCH to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      const body = JSON.stringify({ header: "Updated" });
      await program.parseAsync(["client-invoice", "update", "inv-123", "--body", body], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/inv-123");
      expect(opts.method).toBe("PATCH");
    });
  });

  describe("client-invoice delete", () => {
    it("deletes an invoice with --yes flag", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client-invoice", "delete", "inv-123", "--yes"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
      expect(parsed).toHaveProperty("id", "inv-123");
    });

    it("sends DELETE to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["client-invoice", "delete", "inv-123", "--yes"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/inv-123");
      expect(opts.method).toBe("DELETE");
    });

    it("exits with error when --yes is not provided", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["client-invoice", "delete", "inv-123"], { from: "user" });

      expect(stderrSpy).toHaveBeenCalled();
      const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
      expect(errorOutput).toContain("About to delete client invoice inv-123");
      expect(errorOutput).toContain("--yes");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("client-invoice finalize", () => {
    it("finalizes an invoice in json format", async () => {
      const finalized = { ...sampleInvoice, status: "pending", invoice_number: "INV-001" };
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: finalized }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client-invoice", "finalize", "inv-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("status", "pending");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["client-invoice", "finalize", "inv-123"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/inv-123/finalize");
      expect(opts.method).toBe("POST");
    });
  });

  describe("client-invoice send", () => {
    it("sends an invoice in json format", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client-invoice", "send", "inv-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("sent", true);
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["client-invoice", "send", "inv-123"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/inv-123/send");
      expect(opts.method).toBe("POST");
    });
  });

  describe("client-invoice mark-paid", () => {
    it("marks an invoice as paid in json format", async () => {
      const paid = { ...sampleInvoice, status: "paid" };
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: paid }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client-invoice", "mark-paid", "inv-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("status", "paid");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["client-invoice", "mark-paid", "inv-123"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/inv-123/mark_as_paid");
      expect(opts.method).toBe("POST");
    });
  });

  describe("client-invoice unmark-paid", () => {
    it("unmarks a paid invoice in json format", async () => {
      const pending = { ...sampleInvoice, status: "pending" };
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: pending }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client-invoice", "unmark-paid", "inv-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("status", "pending");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["client-invoice", "unmark-paid", "inv-123"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/inv-123/unmark_as_paid");
      expect(opts.method).toBe("POST");
    });
  });

  describe("client-invoice cancel", () => {
    it("cancels an invoice in json format", async () => {
      const cancelled = { ...sampleInvoice, status: "cancelled" };
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: cancelled }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client-invoice", "cancel", "inv-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("status", "cancelled");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["client-invoice", "cancel", "inv-123"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/inv-123/mark_as_canceled");
      expect(opts.method).toBe("POST");
    });
  });

  describe("client-invoice upload-show", () => {
    it("shows upload details in json format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ upload: sampleUpload }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "client-invoice", "upload-show", "inv-123", "upl-456"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "upl-456");
      expect(parsed).toHaveProperty("file_name", "invoice.pdf");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ upload: sampleUpload }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createClientInvoiceCommand());
      program.exitOverride();

      await program.parseAsync(["client-invoice", "upload-show", "inv-123", "upl-456"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/client_invoices/inv-123/uploads/upl-456");
    });
  });
});
