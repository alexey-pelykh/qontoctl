// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createProgram } from "../../program.js";

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

const ORG_BODY = {
  organization: {
    slug: "test-org",
    legal_name: "Test Org",
    bank_accounts: [{ id: "auto-acc-1", main: true }],
  },
};

function findTransactionCallUrl(spy: ReturnType<typeof vi.fn>): URL {
  const call = spy.mock.calls.find((c) => (c[0] as URL).pathname === "/v2/transactions");
  expect(call, "expected a fetch call to /v2/transactions").toBeDefined();
  return (call as unknown[])[0] as URL;
}

describe("transaction list command", () => {
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
    fetchSpy.mockReturnValue(jsonResponse({ transactions: [], meta: makeMeta() }));

    await runCommand("--bank-account", "acc-123");

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/transactions");
    expect(url.searchParams.get("bank_account_id")).toBe("acc-123");
  });

  it("passes filter options as query params", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transactions: [], meta: makeMeta() }));

    await runCommand(
      "--bank-account",
      "acc-1",
      "--side",
      "debit",
      "--from",
      "2025-01-01",
      "--to",
      "2025-01-31",
      "--sort-by",
      "settled_at:desc",
    );

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("bank_account_id")).toBe("acc-1");
    expect(url.searchParams.get("side")).toBe("debit");
    expect(url.searchParams.get("settled_at_from")).toBe("2025-01-01");
    expect(url.searchParams.get("settled_at_to")).toBe("2025-01-31");
    expect(url.searchParams.get("sort_by")).toBe("settled_at:desc");
  });

  it("passes status filter as array param", async () => {
    fetchSpy.mockImplementation((input: URL) => {
      if (input.pathname === "/v2/organization") return jsonResponse(ORG_BODY);
      return jsonResponse({ transactions: [], meta: makeMeta() });
    });

    await runCommand("--status", "pending", "completed");

    const txnUrl = findTransactionCallUrl(fetchSpy);
    expect(txnUrl.searchParams.getAll("status[]")).toEqual(["pending", "completed"]);
  });

  it("passes with-attachments filter", async () => {
    fetchSpy.mockImplementation((input: URL) => {
      if (input.pathname === "/v2/organization") return jsonResponse(ORG_BODY);
      return jsonResponse({ transactions: [], meta: makeMeta() });
    });

    await runCommand("--with-attachments");

    const txnUrl = findTransactionCallUrl(fetchSpy);
    expect(txnUrl.searchParams.get("with_attachments")).toBe("true");
  });

  it("auto-resolves bank account from organization", async () => {
    fetchSpy.mockImplementation((input: URL) => {
      if (input.pathname === "/v2/organization") return jsonResponse(ORG_BODY);
      return jsonResponse({ transactions: [], meta: makeMeta() });
    });

    await runCommand();

    const txnUrl = findTransactionCallUrl(fetchSpy);
    expect(txnUrl.searchParams.get("bank_account_id")).toBe("auto-acc-1");
  });

  it("outputs JSON when --output json", async () => {
    const txns = [{ id: "txn-1", label: "Coffee", amount: 4.5, side: "debit" }];
    fetchSpy.mockImplementation((input: URL) => {
      if (input.pathname === "/v2/organization") return jsonResponse(ORG_BODY);
      return jsonResponse({ transactions: txns, meta: makeMeta({ total_count: 1 }) });
    });

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
    fetchSpy.mockImplementation((input: URL) => {
      if (input.pathname === "/v2/organization") return jsonResponse(ORG_BODY);
      return jsonResponse({
        transactions: txns,
        meta: makeMeta({ total_count: 1 }),
      });
    });

    await runCommand("--output", "table");

    const output = writtenOutput.join("");
    expect(output).toContain("txn-1");
    expect(output).toContain("Coffee");
    expect(output).not.toContain("extra_field");
    expect(output).not.toContain("should-not-appear");
  });
});
