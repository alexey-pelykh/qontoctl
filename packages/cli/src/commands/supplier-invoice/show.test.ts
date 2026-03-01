// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../../client.js";
import { HttpClient } from "@qontoctl/core";

describe("supplier-invoice show command", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a supplier invoice in table format", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoice: {
          id: "inv-1",
          supplier_name: "Acme Corp",
          invoice_number: "INV-001",
          status: "paid",
          total_amount: { value: "100.00", currency: "EUR" },
          due_date: "2026-04-01",
          issue_date: "2026-03-01",
          payment_date: "2026-03-15",
          file_name: "invoice.pdf",
          is_einvoice: false,
          created_at: "2026-03-01T00:00:00.000Z",
          self: "https://example.com/inv-1",
        },
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["supplier-invoice", "show", "inv-1"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("inv-1");
    expect(output).toContain("Acme Corp");
    expect(output).toContain("100.00 EUR");
  });

  it("shows a supplier invoice in json format", async () => {
    const invoice = {
      id: "inv-1",
      supplier_name: "Acme Corp",
      invoice_number: "INV-001",
      status: "paid",
      total_amount: { value: "100.00", currency: "EUR" },
      due_date: "2026-04-01",
      issue_date: "2026-03-01",
      payment_date: "2026-03-15",
      file_name: "invoice.pdf",
      is_einvoice: false,
      created_at: "2026-03-01T00:00:00.000Z",
      self: "https://example.com/inv-1",
    };
    fetchSpy.mockReturnValue(jsonResponse({ supplier_invoice: invoice }));

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--output", "json", "supplier-invoice", "show", "inv-1"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed).toHaveProperty("id", "inv-1");
    expect(parsed).toHaveProperty("supplier_name", "Acme Corp");
  });

  it("handles null total_amount in table format", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoice: {
          id: "inv-2",
          supplier_name: "No Amount",
          invoice_number: null,
          status: "to_review",
          total_amount: null,
          due_date: null,
          issue_date: null,
          payment_date: null,
          file_name: "doc.pdf",
          is_einvoice: false,
          created_at: "2026-03-01T00:00:00.000Z",
          self: "https://example.com/inv-2",
        },
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["supplier-invoice", "show", "inv-2"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
  });

  it("calls the correct API endpoint", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoice: {
          id: "inv-1",
          supplier_name: "Test",
          invoice_number: null,
          status: "to_review",
          total_amount: null,
          due_date: null,
          issue_date: null,
          payment_date: null,
          file_name: "test.pdf",
          is_einvoice: false,
          created_at: "2026-03-01T00:00:00.000Z",
          self: "https://example.com/inv-1",
        },
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["supplier-invoice", "show", "inv-1"], { from: "user" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/supplier_invoices/inv-1");
  });
});
