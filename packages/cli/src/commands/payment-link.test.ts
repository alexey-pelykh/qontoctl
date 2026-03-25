// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createPaymentLinkCommand } from "./payment-link.js";
import { OUTPUT_FORMATS } from "../options.js";
import type { PaginationMeta } from "../pagination.js";

function makeMeta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 1,
    per_page: 100,
    ...overrides,
  };
}

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

/**
 * Create a lightweight test program with only the global options and
 * payment-link commands registered.  This avoids the expensive dynamic
 * import of the full program module (which loads every command module) that
 * can exceed the per-test timeout on slower CI runners (e.g. Windows).
 */
function createTestProgram(): Command {
  const program = new Command();
  program
    .addOption(new Option("-o, --output <format>", "output format").choices([...OUTPUT_FORMATS]).default("table"))
    .addOption(new Option("--no-paginate", "disable auto-pagination"));
  program.addCommand(createPaymentLinkCommand());
  program.exitOverride();
  return program;
}

const samplePaymentLink = {
  id: "pl-uuid-1",
  status: "open",
  expiration_date: "2026-06-01T00:00:00.000Z",
  potential_payment_methods: ["credit_card", "apple_pay"],
  amount: { value: "50.00", currency: "EUR" },
  resource_type: "Basket",
  items: [
    {
      title: "Widget",
      quantity: 2,
      unit_price: { value: "25.00", currency: "EUR" },
      vat_rate: "20.0",
    },
  ],
  reusable: false,
  invoice_id: null,
  invoice_number: null,
  debitor_name: null,
  created_at: "2026-01-15T10:00:00.000Z",
  url: "https://pay.qonto.com/pl-uuid-1",
};

const samplePayment = {
  id: "pay-uuid-1",
  amount: { value: "50.00", currency: "EUR" },
  status: "paid",
  created_at: "2026-01-16T12:00:00.000Z",
  payment_method: "credit_card",
  paid_at: "2026-01-16T12:05:00.000Z",
  debitor_email: "customer@example.com",
};

const samplePaymentMethod = { name: "credit_card", enabled: true };

const sampleConnection = {
  connection_location: "https://connect.provider.com/setup",
  status: "enabled",
  bank_account_id: "ba-uuid-1",
};

describe("payment-link commands", () => {
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

  describe("payment-link list", () => {
    it("lists payment links in json format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          payment_links: [samplePaymentLink],
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({
        id: "pl-uuid-1",
        status: "open",
        amount: { value: "50.00", currency: "EUR" },
        resource_type: "Basket",
        reusable: false,
        url: "https://pay.qonto.com/pl-uuid-1",
      });
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          payment_links: [],
          meta: makeMeta({ total_count: 0 }),
        }),
      );

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/payment_links");
    });

    it("passes --status filter as query param", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          payment_links: [],
          meta: makeMeta({ total_count: 0 }),
        }),
      );

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "list", "--status", "open"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("status[]")).toBe("open");
    });
  });

  describe("payment-link show", () => {
    it("shows payment link details in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ payment_link: samplePaymentLink }));

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "show", "pl-uuid-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "pl-uuid-1");
      expect(parsed).toHaveProperty("status", "open");
      expect(parsed).toHaveProperty("url", "https://pay.qonto.com/pl-uuid-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ payment_link: samplePaymentLink }));

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "show", "pl-uuid-1"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/payment_links/pl-uuid-1");
    });
  });

  describe("payment-link create", () => {
    it("creates a payment link and returns json output", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ payment_link: samplePaymentLink }));

      const body = JSON.stringify({
        resource_type: "Basket",
        items: [{ title: "Widget", quantity: 2, unit_price: { value: "25.00", currency: "EUR" }, vat_rate: "20.0" }],
      });

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "create", "--body", body], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "pl-uuid-1");
      expect(parsed).toHaveProperty("status", "open");
    });

    it("sends POST to the correct endpoint with body", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ payment_link: samplePaymentLink }));

      const bodyObj = {
        resource_type: "Basket",
        items: [{ title: "Widget", quantity: 2, unit_price: { value: "25.00", currency: "EUR" }, vat_rate: "20.0" }],
      };

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "create", "--body", JSON.stringify(bodyObj)], {
        from: "user",
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/payment_links");
      expect(opts.method).toBe("POST");
      const sentBody = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(sentBody).toEqual(bodyObj);
    });
  });

  describe("payment-link deactivate", () => {
    it("exits with error when --yes is not provided", async () => {
      const program = createTestProgram();
      await program.parseAsync(["payment-link", "deactivate", "pl-uuid-1"], { from: "user" });

      expect(stderrSpy).toHaveBeenCalled();
      const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
      expect(errorOutput).toContain("About to deactivate payment link pl-uuid-1");
      expect(errorOutput).toContain("--yes");
      expect(process.exitCode).toBe(1);
    });

    it("deactivates a payment link with --yes flag", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          payment_link: { ...samplePaymentLink, status: "canceled" },
        }),
      );

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "deactivate", "pl-uuid-1", "--yes"], {
        from: "user",
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/payment_links/pl-uuid-1/deactivate");
      expect(opts.method).toBe("PATCH");
    });
  });

  describe("payment-link payments", () => {
    it("lists payments for a payment link in json format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          payments: [samplePayment],
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "payments", "pl-uuid-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({
        id: "pay-uuid-1",
        status: "paid",
        amount: { value: "50.00", currency: "EUR" },
        payment_method: "credit_card",
        debitor_email: "customer@example.com",
      });
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          payments: [],
          meta: makeMeta({ total_count: 0 }),
        }),
      );

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "payments", "pl-uuid-1"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/payment_links/pl-uuid-1/payments");
    });
  });

  describe("payment-link methods", () => {
    it("lists available payment methods in json format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          payment_link_payment_methods: [samplePaymentMethod],
        }),
      );

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "methods"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({ name: "credit_card", enabled: true });
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          payment_link_payment_methods: [],
        }),
      );

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "methods"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/payment_links/payment_methods");
    });
  });

  describe("payment-link connect", () => {
    it("establishes a connection and returns json output", async () => {
      fetchSpy.mockImplementation(() => jsonResponse(sampleConnection));

      const body = JSON.stringify({ bank_account_id: "ba-uuid-1" });

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "connect", "--body", body], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("connection_location", "https://connect.provider.com/setup");
      expect(parsed).toHaveProperty("status", "enabled");
      expect(parsed).toHaveProperty("bank_account_id", "ba-uuid-1");
    });

    it("sends POST to the correct endpoint with body", async () => {
      fetchSpy.mockImplementation(() => jsonResponse(sampleConnection));

      const bodyObj = { bank_account_id: "ba-uuid-1" };

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "connect", "--body", JSON.stringify(bodyObj)], {
        from: "user",
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/payment_links/connections");
      expect(opts.method).toBe("POST");
      const sentBody = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(sentBody).toEqual(bodyObj);
    });
  });

  describe("payment-link connection-status", () => {
    it("shows connection status in json format", async () => {
      fetchSpy.mockImplementation(() => jsonResponse(sampleConnection));

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "connection-status"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("connection_location", "https://connect.provider.com/setup");
      expect(parsed).toHaveProperty("status", "enabled");
      expect(parsed).toHaveProperty("bank_account_id", "ba-uuid-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() => jsonResponse(sampleConnection));

      const program = createTestProgram();
      await program.parseAsync(["--output", "json", "payment-link", "connection-status"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/payment_links/connections");
    });
  });
});
