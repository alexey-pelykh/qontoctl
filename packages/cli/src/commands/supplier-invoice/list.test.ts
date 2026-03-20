// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import type { PaginationMeta } from "../../pagination.js";

function makeMeta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 0,
    per_page: 100,
    ...overrides,
  };
}

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../../client.js";
import { HttpClient } from "@qontoctl/core";

describe("supplier-invoice list command", () => {
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

  it("lists supplier invoices in table format", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoices: [
          {
            id: "inv-1",
            organization_id: "org-1",
            status: "paid",
            source_type: "email",
            source: "supplier@example.com",
            attachment_id: "att-1",
            display_attachment_id: "datt-1",
            file_name: "invoice.pdf",
            invoice_number: "INV-001",
            supplier_name: "Acme Corp",
            total_amount: { value: "100.00", currency: "EUR" },
            total_amount_excluding_taxes: null,
            total_tax_amount: null,
            payable_amount: null,
            issue_date: "2026-03-01",
            due_date: "2026-04-01",
            payment_date: "2026-03-15",
            scheduled_date: null,
            iban: null,
            is_einvoice: false,
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        ],
        meta: makeMeta({ total_count: 1 }),
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["supplier-invoice", "list"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("inv-1");
    expect(output).toContain("Acme Corp");
    expect(output).toContain("paid");
  });

  it("lists supplier invoices in json format", async () => {
    const invoices = [
      {
        id: "inv-1",
        organization_id: "org-1",
        status: "paid",
        source_type: "email",
        source: "supplier@example.com",
        attachment_id: "att-1",
        display_attachment_id: "datt-1",
        file_name: "invoice.pdf",
        invoice_number: "INV-001",
        supplier_name: "Acme Corp",
        total_amount: { value: "100.00", currency: "EUR" },
        total_amount_excluding_taxes: null,
        total_tax_amount: null,
        payable_amount: null,
        issue_date: "2026-03-01",
        due_date: "2026-04-01",
        payment_date: "2026-03-15",
        scheduled_date: null,
        iban: null,
        is_einvoice: false,
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-01T00:00:00.000Z",
      },
    ];
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoices: invoices,
        meta: makeMeta({ total_count: 1 }),
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--output", "json", "supplier-invoice", "list"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as unknown[];
    expect(parsed).toHaveLength(1);
    const first = parsed[0] as Record<string, unknown>;
    expect(first).toHaveProperty("id", "inv-1");
  });

  it("formats total_amount as null when absent", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoices: [
          {
            id: "inv-2",
            organization_id: "org-1",
            status: "to_review",
            source_type: "email",
            source: "supplier@example.com",
            attachment_id: "att-2",
            display_attachment_id: "datt-2",
            file_name: "doc.pdf",
            invoice_number: null,
            supplier_name: "No Amount Corp",
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
        meta: makeMeta({ total_count: 1 }),
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["supplier-invoice", "list"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
  });

  it("passes status filter to API", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoices: [],
        meta: makeMeta(),
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["supplier-invoice", "list", "--status", "paid"], { from: "user" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("filter[status][]")).toBe("paid");
  });

  it("passes query and sort params", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        supplier_invoices: [],
        meta: makeMeta(),
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["supplier-invoice", "list", "--query", "acme", "--sort-by", "created_at:desc"], {
      from: "user",
    });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("query")).toBe("acme");
    expect(url.searchParams.get("sort_by")).toBe("created_at:desc");
  });
});
