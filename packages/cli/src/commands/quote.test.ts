// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command, Option } from "commander";
import { jsonResponse } from "@qontoctl/core/testing";
import { createQuoteCommand } from "./quote.js";
import { OUTPUT_FORMATS } from "../options.js";

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

function createTestProgram(): Command {
  const program = new Command();
  program
    .addOption(new Option("-o, --output <format>", "output format").choices([...OUTPUT_FORMATS]).default("table"))
    .addOption(new Option("--no-paginate", "disable auto-pagination"));
  program.addCommand(createQuoteCommand());
  program.exitOverride();
  return program;
}

const sampleQuote = {
  id: "qt-123",
  organization_id: "org-1",
  number: "QT-001",
  status: "pending_approval",
  currency: "EUR",
  total_amount: { value: "240.00", currency: "EUR" },
  total_amount_cents: 24000,
  vat_amount: { value: "40.00", currency: "EUR" },
  vat_amount_cents: 4000,
  issue_date: "2026-01-15",
  expiry_date: "2026-02-15",
  created_at: "2026-01-15T10:00:00Z",
  approved_at: null,
  canceled_at: null,
  attachment_id: null,
  quote_url: null,
  contact_email: null,
  terms_and_conditions: "Valid for 30 days",
  header: null,
  footer: null,
  discount: null,
  items: [
    {
      title: "Consulting",
      description: null,
      quantity: "2",
      unit: null,
      vat_rate: "20",
      vat_exemption_reason: null,
      unit_price: { value: "100.00", currency: "EUR" },
      unit_price_cents: 10000,
      total_amount: { value: "240.00", currency: "EUR" },
      total_amount_cents: 24000,
      total_vat: { value: "40.00", currency: "EUR" },
      total_vat_cents: 4000,
      subtotal: { value: "200.00", currency: "EUR" },
      subtotal_cents: 20000,
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
  invoice_ids: [],
};

describe("quote commands", () => {
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

  describe("quote list", () => {
    it("lists quotes in table format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          quotes: [sampleQuote],
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

      const program = createTestProgram();

      await program.parseAsync(["quote", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("qt-123");
      expect(output).toContain("Acme Corp");
    });

    it("lists quotes in json format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          quotes: [sampleQuote],
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

      const program = createTestProgram();

      await program.parseAsync(["--output", "json", "quote", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      const first = parsed[0] as Record<string, unknown>;
      expect(first).toHaveProperty("id", "qt-123");
      expect(first).toHaveProperty("status", "pending_approval");
    });

    it("passes filter and sort parameters", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          quotes: [],
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 0,
            total_count: 0,
            per_page: 100,
          },
        }),
      );

      const program = createTestProgram();

      await program.parseAsync(
        [
          "quote",
          "list",
          "--status",
          "approved",
          "--created-from",
          "2026-01-01",
          "--created-to",
          "2026-12-31",
          "--sort-by",
          "created_at:desc",
        ],
        { from: "user" },
      );

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("filter[status]")).toBe("approved");
      expect(url.searchParams.get("filter[created_at_from]")).toBe("2026-01-01");
      expect(url.searchParams.get("filter[created_at_to]")).toBe("2026-12-31");
      expect(url.searchParams.get("sort_by")).toBe("created_at:desc");
    });

    it("displays individual client name from first_name and last_name", async () => {
      const individualQuote = {
        ...sampleQuote,
        client: {
          ...sampleQuote.client,
          name: null,
          first_name: "Jane",
          last_name: "Doe",
        },
      };
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          quotes: [individualQuote],
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

      const program = createTestProgram();

      await program.parseAsync(["quote", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Jane Doe");
    });
  });

  describe("quote show", () => {
    it("shows quote details in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ quote: sampleQuote }));

      const program = createTestProgram();

      await program.parseAsync(["--output", "json", "quote", "show", "qt-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "qt-123");
      expect(parsed).toHaveProperty("status", "pending_approval");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ quote: sampleQuote }));

      const program = createTestProgram();

      await program.parseAsync(["quote", "show", "qt-123"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/quotes/qt-123");
    });
  });

  describe("quote create", () => {
    it("creates a quote in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ quote: sampleQuote }));

      const program = createTestProgram();

      const body = JSON.stringify({ client_id: "cl-123", items: [] });
      await program.parseAsync(["--output", "json", "quote", "create", "--body", body], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "qt-123");
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ quote: sampleQuote }));

      const program = createTestProgram();

      const body = JSON.stringify({ client_id: "cl-123" });
      await program.parseAsync(["quote", "create", "--body", body], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/quotes");
      expect(opts.method).toBe("POST");
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ quote: sampleQuote }));

      const program = createTestProgram();

      const body = JSON.stringify({ client_id: "cl-123" });
      await program.parseAsync(["quote", "create", "--body", body, "--idempotency-key", "key-abc-123"], {
        from: "user",
      });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-abc-123");
    });
  });

  describe("quote update", () => {
    it("updates a quote in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ quote: sampleQuote }));

      const program = createTestProgram();

      const body = JSON.stringify({ header: "Updated" });
      await program.parseAsync(["--output", "json", "quote", "update", "qt-123", "--body", body], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "qt-123");
    });

    it("sends PATCH to the correct endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ quote: sampleQuote }));

      const program = createTestProgram();

      const body = JSON.stringify({ header: "Updated" });
      await program.parseAsync(["quote", "update", "qt-123", "--body", body], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/quotes/qt-123");
      expect(opts.method).toBe("PATCH");
    });
  });

  describe("quote delete", () => {
    it("deletes a quote with --yes flag", async () => {
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));

      const program = createTestProgram();

      await program.parseAsync(["--output", "json", "quote", "delete", "qt-123", "--yes"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
      expect(parsed).toHaveProperty("id", "qt-123");
    });

    it("sends DELETE to the correct endpoint", async () => {
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));

      const program = createTestProgram();

      await program.parseAsync(["quote", "delete", "qt-123", "--yes"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/quotes/qt-123");
      expect(opts.method).toBe("DELETE");
    });

    it("exits with error when --yes is not provided", async () => {
      const program = createTestProgram();

      await program.parseAsync(["quote", "delete", "qt-123"], { from: "user" });

      expect(stderrSpy).toHaveBeenCalled();
      const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
      expect(errorOutput).toContain("About to delete quote qt-123");
      expect(errorOutput).toContain("--yes");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("quote send", () => {
    it("sends a quote in json format", async () => {
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));

      const program = createTestProgram();

      await program.parseAsync(["--output", "json", "quote", "send", "qt-123"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("sent", true);
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));

      const program = createTestProgram();

      await program.parseAsync(["quote", "send", "qt-123"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/quotes/qt-123/send");
      expect(opts.method).toBe("POST");
    });
  });
});
