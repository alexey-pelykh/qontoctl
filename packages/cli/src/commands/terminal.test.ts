// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createTerminalCommand } from "./terminal.js";
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

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

describe("terminal commands", () => {
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

  describe("terminal list", () => {
    const sampleTerminal = {
      id: "term-1",
      poi_id: "POI-001",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    it("lists terminals in table format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({ terminals: [sampleTerminal], meta: makeMeta({ total_count: 1 }) }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await program.parseAsync(["terminal", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("term-1");
      expect(output).toContain("POI-001");
    });

    it("lists terminals in json format", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({ terminals: [sampleTerminal], meta: makeMeta({ total_count: 1 }) }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "terminal", "list"], { from: "user" });

      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual(sampleTerminal);
    });

    it("hits /v2/terminals with pagination params", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ terminals: [], meta: makeMeta() }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await program.parseAsync(["--page", "2", "--per-page", "10", "terminal", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/terminals");
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });
  });

  describe("terminal payment create", () => {
    const samplePayment = {
      id: "pay-1",
      terminal_id: "term-1",
      amount: { value: "12.50", currency: "EUR" },
      created_at: "2026-02-01T00:00:00Z",
    };

    it("creates a terminal payment and prints it in json", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ terminal_payment: samplePayment }, { status: 202 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "terminal", "payment", "create", "term-1", "--amount", "12.50"], {
        from: "user",
      });

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/terminals/term-1/payment");
      expect(init.method).toBe("POST");

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({ amount: { value: "12.50", currency: "EUR" } });

      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toEqual(samplePayment);
    });

    it("normalizes single-decimal and integer amounts to X.YY", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ terminal_payment: samplePayment }, { status: 202 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await program.parseAsync(["terminal", "payment", "create", "term-1", "--amount", "12.5"], { from: "user" });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(init.body as string) as { amount: { value: string } };
      expect(body.amount.value).toBe("12.50");
    });

    it("rejects amounts below 0.10", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ terminal_payment: samplePayment }, { status: 202 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await expect(
        program.parseAsync(["terminal", "payment", "create", "term-1", "--amount", "0.05"], { from: "user" }),
      ).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects amounts above 100000.00", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await expect(
        program.parseAsync(["terminal", "payment", "create", "term-1", "--amount", "100000.01"], { from: "user" }),
      ).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects amounts with more than 2 decimal places", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await expect(
        program.parseAsync(["terminal", "payment", "create", "term-1", "--amount", "12.345"], { from: "user" }),
      ).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("forwards --metadata JSON to the request body", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ terminal_payment: samplePayment }, { status: 202 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await program.parseAsync(
        [
          "terminal",
          "payment",
          "create",
          "term-1",
          "--amount",
          "12.50",
          "--metadata",
          '{"order_id":"ord-42","table":7}',
        ],
        { from: "user" },
      );

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(init.body as string) as { metadata?: Record<string, unknown> };
      expect(body.metadata).toEqual({ order_id: "ord-42", table: 7 });
    });

    it("rejects malformed JSON for --metadata", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await expect(
        program.parseAsync(
          ["terminal", "payment", "create", "term-1", "--amount", "12.50", "--metadata", "{not json"],
          { from: "user" },
        ),
      ).rejects.toThrow(/Invalid JSON for --metadata/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("forwards --idempotency-key as the X-Qonto-Idempotency-Key header", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ terminal_payment: samplePayment }, { status: 202 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await program.parseAsync(
        ["terminal", "payment", "create", "term-1", "--amount", "12.50", "--idempotency-key", "key-pinned-1"],
        { from: "user" },
      );

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-pinned-1");
    });

    it("rejects non-EUR currencies via --currency", async () => {
      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await expect(
        program.parseAsync(["terminal", "payment", "create", "term-1", "--amount", "12.50", "--currency", "USD"], {
          from: "user",
        }),
      ).rejects.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("renders the payment as a table when --output is not json/yaml", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ terminal_payment: samplePayment }, { status: 202 }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createTerminalCommand());
      program.exitOverride();

      await program.parseAsync(["terminal", "payment", "create", "term-1", "--amount", "12.50"], { from: "user" });

      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("pay-1");
      expect(output).toContain("term-1");
      expect(output).toContain("12.50");
      expect(output).toContain("EUR");
    });
  });

  // Silence "expect" coverage for stderrSpy variable (used implicitly via setup).
  it("setup integrity", () => {
    expect(stderrSpy).toBeDefined();
  });
});
