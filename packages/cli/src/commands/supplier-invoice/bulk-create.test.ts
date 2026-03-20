// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("fake-pdf-content")),
}));

import { createClient } from "../../client.js";
import { HttpClient } from "@qontoctl/core";

describe("supplier-invoice bulk-create command", () => {
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
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("creates supplier invoices from files", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoices: [
          {
            id: "new-inv-1",
            organization_id: "org-1",
            status: "to_review",
            source_type: "api",
            source: "api-upload",
            attachment_id: "att-1",
            display_attachment_id: "datt-1",
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
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        ],
        errors: [],
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["supplier-invoice", "bulk-create", "/tmp/invoice.pdf"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("new-inv-1");
  });

  it("outputs json format for created invoices", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoices: [
          {
            id: "new-inv-1",
            organization_id: "org-1",
            status: "to_review",
            source_type: "api",
            source: "api-upload",
            attachment_id: "att-1",
            display_attachment_id: "datt-1",
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
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        ],
        errors: [],
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--output", "json", "supplier-invoice", "bulk-create", "/tmp/invoice.pdf"], {
      from: "user",
    });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as unknown[];
    expect(parsed).toHaveLength(1);
  });

  it("writes errors to stderr and sets exit code", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoices: [],
        errors: [
          {
            code: "invalid_file_type",
            detail: "File type not supported",
          },
        ],
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["supplier-invoice", "bulk-create", "/tmp/bad.txt"], { from: "user" });

    expect(stderrSpy).toHaveBeenCalled();
    const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
    expect(errorOutput).toContain("invalid_file_type");
    expect(process.exitCode).toBe(1);
  });

  it("sends FormData to the bulk endpoint", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoices: [],
        errors: [],
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["supplier-invoice", "bulk-create", "/tmp/invoice.pdf"], { from: "user" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/supplier_invoices/bulk");
  });
});
