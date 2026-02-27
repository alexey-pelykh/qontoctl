// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProgram } from "../../program.js";

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
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

describe("transaction list command", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let writtenOutput: string[];

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    writtenOutput = [];
    vi.spyOn(process.stdout, "write").mockImplementation(
      (chunk: string | Uint8Array): boolean => {
        writtenOutput.push(String(chunk));
        return true;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function runCommand(...args: string[]) {
    vi.stubEnv("QONTOCTL_ORGANIZATION_SLUG", "test-org");
    vi.stubEnv("QONTOCTL_SECRET_KEY", "test-secret");

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "qontoctl", "transaction", "list", ...args]);
  }

  it("registers transaction list command", () => {
    const program = createProgram();
    const txn = program.commands.find((c) => c.name() === "transaction");
    expect(txn).toBeDefined();
    const list = txn?.commands.find((c) => c.name() === "list");
    expect(list).toBeDefined();
  });

  it("sends request to /v2/transactions", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({ transactions: [], meta: makeMeta() }),
    );

    await runCommand("--bank-account", "acc-123");

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/transactions");
    expect(url.searchParams.get("bank_account_id")).toBe("acc-123");
  });

  it("passes filter options as query params", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({ transactions: [], meta: makeMeta() }),
    );

    await runCommand(
      "--bank-account", "acc-1",
      "--side", "debit",
      "--from", "2025-01-01",
      "--to", "2025-01-31",
      "--sort-by", "settled_at:desc",
    );

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("bank_account_id")).toBe("acc-1");
    expect(url.searchParams.get("side")).toBe("debit");
    expect(url.searchParams.get("settled_at_from")).toBe("2025-01-01");
    expect(url.searchParams.get("settled_at_to")).toBe("2025-01-31");
    expect(url.searchParams.get("sort_by")).toBe("settled_at:desc");
  });

  it("passes status filter as array param", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({ transactions: [], meta: makeMeta() }),
    );

    await runCommand("--status", "pending", "completed");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("status[]")).toEqual(["pending", "completed"]);
  });

  it("passes with-attachments filter", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({ transactions: [], meta: makeMeta() }),
    );

    await runCommand("--with-attachments");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("with_attachments")).toBe("true");
  });

  it("outputs JSON when --output json", async () => {
    const txns = [
      { id: "txn-1", label: "Coffee", amount: 4.5, side: "debit" },
    ];
    fetchSpy.mockReturnValue(
      jsonResponse({ transactions: txns, meta: makeMeta({ total_count: 1 }) }),
    );

    await runCommand("--output", "json");

    expect(writtenOutput.length).toBeGreaterThan(0);
    const parsed = JSON.parse(writtenOutput.join(""));
    expect(parsed).toEqual(txns);
  });

  it("outputs table rows with selected columns", async () => {
    const txns = [
      {
        id: "txn-1",
        label: "Coffee",
        amount: 4.5,
        side: "debit",
        currency: "EUR",
        status: "completed",
        operation_type: "card",
        settled_at: "2025-01-15",
        extra_field: "should-not-appear",
      },
    ];
    fetchSpy.mockReturnValue(
      jsonResponse({
        transactions: txns,
        meta: makeMeta({ total_count: 1 }),
      }),
    );

    await runCommand("--output", "table");

    const output = writtenOutput.join("");
    expect(output).toContain("txn-1");
    expect(output).toContain("Coffee");
    expect(output).not.toContain("extra_field");
    expect(output).not.toContain("should-not-appear");
  });
});
