// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";

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

describe("recurring-transfer list command", () => {
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

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "qontoctl", "recurring-transfer", "list", ...args]);
  }

  it("sends request to /v2/sepa/recurring_transfers", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ recurring_transfers: [], meta: makeMeta() }));

    await runCommand();

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers");
  });

  it("outputs JSON when --output json", async () => {
    const recurringTransfers = [
      {
        id: "rt-1",
        initiator_id: "user-1",
        bank_account_id: "acc-1",
        amount: 200,
        amount_cents: 20000,
        amount_currency: "EUR",
        beneficiary_id: "ben-1",
        reference: "Monthly rent",
        note: "",
        first_execution_date: "2026-04-01",
        last_execution_date: null,
        next_execution_date: "2026-04-01",
        frequency: "monthly",
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ];
    fetchSpy.mockImplementation(() =>
      jsonResponse({ recurring_transfers: recurringTransfers, meta: makeMeta({ total_count: 1 }) }),
    );

    await runCommand("--output", "json");

    expect(writtenOutput.length).toBeGreaterThan(0);
    const parsed = JSON.parse(writtenOutput.join(""));
    expect(parsed).toEqual(recurringTransfers);
  });

  it("outputs table rows with selected columns", async () => {
    const recurringTransfers = [
      {
        id: "rt-1",
        initiator_id: "user-1",
        bank_account_id: "acc-1",
        amount: 200,
        amount_cents: 20000,
        amount_currency: "EUR",
        beneficiary_id: "ben-1",
        reference: "Monthly rent",
        note: "should-not-appear-in-table",
        first_execution_date: "2026-04-01",
        last_execution_date: null,
        next_execution_date: "2026-04-01",
        frequency: "monthly",
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ];
    fetchSpy.mockImplementation(() =>
      jsonResponse({ recurring_transfers: recurringTransfers, meta: makeMeta({ total_count: 1 }) }),
    );

    await runCommand("--output", "table");

    const output = writtenOutput.join("");
    expect(output).toContain("rt-1");
    expect(output).toContain("ben-1");
    expect(output).toContain("monthly");
    expect(output).not.toContain("should-not-appear-in-table");
  });
});
