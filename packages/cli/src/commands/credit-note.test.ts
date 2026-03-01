// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createCreditNoteCommand } from "./credit-note.js";
import type { PaginationMeta } from "../pagination.js";

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

function makeCreditNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "cn-001",
    invoice_id: "inv-001",
    attachment_id: "att-001",
    number: "CN-2026-001",
    issue_date: "2026-01-15",
    invoice_issue_date: "2026-01-01",
    header: "",
    footer: "",
    terms_and_conditions: "",
    currency: "EUR",
    vat_amount: { value: "2.00", currency: "EUR" },
    vat_amount_cents: 200,
    total_amount: { value: "12.00", currency: "EUR" },
    total_amount_cents: 1200,
    stamp_duty_amount: "0.00",
    created_at: "2026-01-15T10:00:00Z",
    finalized_at: "2026-01-15T10:00:00Z",
    contact_email: "contact@example.com",
    invoice_url: "https://pay.qonto.com/invoices/inv-001",
    einvoicing_status: "approved",
    items: [],
    client: {
      id: "client-001",
      name: "Acme Corp",
      first_name: "",
      last_name: "",
      type: "company",
      email: "acme@example.com",
      vat_number: "FR12345678901",
      tax_identification_number: "",
      address: "1 Rue Example",
      city: "Paris",
      zip_code: "75001",
      country_code: "FR",
      locale: "fr",
    },
    ...overrides,
  };
}

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

describe("credit-note commands", () => {
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

  describe("credit-note list", () => {
    it("lists credit notes in table format", async () => {
      const creditNotes = [makeCreditNote(), makeCreditNote({ id: "cn-002", number: "CN-2026-002" })];
      fetchSpy.mockReturnValue(
        jsonResponse({
          credit_notes: creditNotes,
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createCreditNoteCommand());
      program.exitOverride();

      await program.parseAsync(["credit-note", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("cn-001");
      expect(output).toContain("CN-2026-001");
      expect(output).toContain("Acme Corp");
      expect(output).toContain("cn-002");
      expect(output).toContain("CN-2026-002");
    });

    it("lists credit notes in json format", async () => {
      const creditNotes = [makeCreditNote()];
      fetchSpy.mockReturnValue(
        jsonResponse({
          credit_notes: creditNotes,
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createCreditNoteCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "credit-note", "list"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect((parsed[0] as Record<string, unknown>)["id"]).toBe("cn-001");
      expect((parsed[0] as Record<string, unknown>)["number"]).toBe("CN-2026-001");
    });

    it("passes pagination options to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          credit_notes: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createCreditNoteCommand());
      program.exitOverride();

      await program.parseAsync(["--page", "2", "--per-page", "50", "credit-note", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("50");
    });
  });

  describe("credit-note show", () => {
    it("shows credit note details in table format", async () => {
      const creditNote = makeCreditNote();
      fetchSpy.mockReturnValue(jsonResponse({ credit_note: creditNote }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createCreditNoteCommand());
      program.exitOverride();

      await program.parseAsync(["credit-note", "show", "cn-001"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("cn-001");
      expect(output).toContain("CN-2026-001");
      expect(output).toContain("Acme Corp");
    });

    it("shows credit note in json format", async () => {
      const creditNote = makeCreditNote();
      fetchSpy.mockReturnValue(jsonResponse({ credit_note: creditNote }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createCreditNoteCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "credit-note", "show", "cn-001"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed["id"]).toBe("cn-001");
      expect(parsed["number"]).toBe("CN-2026-001");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          credit_note: makeCreditNote(),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createCreditNoteCommand());
      program.exitOverride();

      await program.parseAsync(["credit-note", "show", "cn-001"], {
        from: "user",
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/credit_notes/cn-001");
    });
  });
});
