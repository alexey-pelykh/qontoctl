// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command, Option } from "commander";
import { jsonResponse } from "@qontoctl/core/testing";
import { registerTransferCommands } from "./index.js";
import { OUTPUT_FORMATS } from "../../options.js";

vi.mock("../../client.js", async () => {
  const { HttpClient } = await import("@qontoctl/core");
  return {
    createClient: vi.fn().mockResolvedValue(
      new HttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "test-org:test-secret",
      }),
    ),
  };
});

/**
 * Create a lightweight test program with only the global options and
 * transfer commands registered.  This avoids the expensive dynamic
 * import of the full program module (which loads every command module)
 * that can exceed the per-test timeout on slower CI runners (e.g. Windows).
 */
function createTestProgram(): Command {
  const program = new Command();
  program
    .addOption(new Option("-o, --output <format>", "output format").choices([...OUTPUT_FORMATS]).default("table"))
    .addOption(new Option("--no-paginate", "disable auto-pagination"));
  registerTransferCommands(program);
  program.exitOverride();
  return program;
}

function makeMeta(overrides: Record<string, unknown> = {}) {
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

describe("transfer list command", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let writtenOutput: string[];

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    writtenOutput = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
      writtenOutput.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function runCommand(...args: string[]) {
    vi.stubEnv("QONTOCTL_ORGANIZATION_SLUG", "test-org");
    vi.stubEnv("QONTOCTL_SECRET_KEY", "test-secret");

    const program = createTestProgram();
    await program.parseAsync(["node", "qontoctl", "transfer", "list", ...args]);
  }

  it("sends request to /v2/sepa/transfers", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ transfers: [], meta: makeMeta() }));

    await runCommand();

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers");
  });

  it("passes status filter as array param", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ transfers: [], meta: makeMeta() }));

    await runCommand("--status", "pending", "settled");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("status[]")).toEqual(["pending", "settled"]);
  });

  it("passes beneficiary filter", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ transfers: [], meta: makeMeta() }));

    await runCommand("--beneficiary", "ben-123");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("beneficiary_ids[]")).toEqual(["ben-123"]);
  });

  it("passes date range and sort params", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ transfers: [], meta: makeMeta() }));

    await runCommand("--from", "2025-01-01", "--to", "2025-01-31", "--sort-by", "updated_at:desc");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("updated_at_from")).toBe("2025-01-01");
    expect(url.searchParams.get("updated_at_to")).toBe("2025-01-31");
    expect(url.searchParams.get("sort_by")).toBe("updated_at:desc");
  });

  it("outputs JSON when --output json", async () => {
    const transfers = [
      {
        id: "txfr-1",
        beneficiary_id: "ben-1",
        amount: 100.5,
        amount_currency: "EUR",
        status: "settled",
        reference: "Invoice 001",
      },
    ];
    fetchSpy.mockImplementation(() => jsonResponse({ transfers, meta: makeMeta({ total_count: 1 }) }));

    await runCommand("--output", "json");

    expect(writtenOutput.length).toBeGreaterThan(0);
    const parsed = JSON.parse(writtenOutput.join(""));
    expect(parsed).toEqual(transfers);
  });

  it("outputs table rows with selected columns", async () => {
    const transfers = [
      {
        id: "txfr-1",
        beneficiary_id: "ben-1",
        amount: 100.5,
        amount_cents: 10050,
        amount_currency: "EUR",
        status: "settled",
        reference: "Invoice 001",
        scheduled_date: "2025-01-15",
        note: "should-not-appear-in-table",
      },
    ];
    fetchSpy.mockImplementation(() => jsonResponse({ transfers, meta: makeMeta({ total_count: 1 }) }));

    await runCommand("--output", "table");

    const output = writtenOutput.join("");
    expect(output).toContain("txfr-1");
    expect(output).toContain("ben-1");
    expect(output).toContain("Invoice 001");
    expect(output).not.toContain("should-not-appear-in-table");
  });
});
