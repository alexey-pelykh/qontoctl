// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command, Option } from "commander";
import { jsonResponse } from "@qontoctl/core/testing";
import { registerRecurringTransferCommands } from "./index.js";
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
 * recurring-transfer commands registered.  This avoids the expensive dynamic
 * import of the full program module (which loads every command module)
 * that can exceed the per-test timeout on slower CI runners (e.g. Windows).
 */
function createTestProgram(): Command {
  const program = new Command();
  program
    .addOption(new Option("-o, --output <format>", "output format").choices([...OUTPUT_FORMATS]).default("table"))
    .addOption(new Option("--no-paginate", "disable auto-pagination"));
  registerRecurringTransferCommands(program);
  program.exitOverride();
  return program;
}

describe("recurring-transfer show command", () => {
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
    await program.parseAsync(["node", "qontoctl", "recurring-transfer", "show", ...args]);
  }

  const completeRecurringTransfer = {
    id: "rt-123",
    initiator_id: "user-1",
    bank_account_id: "acc-1",
    amount: 500,
    amount_cents: 50000,
    amount_currency: "EUR",
    beneficiary_id: "ben-1",
    reference: "Quarterly payment",
    note: "Office lease",
    first_execution_date: "2026-01-01",
    last_execution_date: null,
    next_execution_date: "2026-04-01",
    frequency: "quarterly",
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  it("fetches a recurring transfer by ID", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ recurring_transfer: completeRecurringTransfer }));

    await runCommand("rt-123", "--output", "json");

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers/rt-123");

    const parsed = JSON.parse(writtenOutput.join(""));
    expect(parsed).toEqual(completeRecurringTransfer);
  });

  it("outputs yaml format for single recurring transfer", async () => {
    const rt = { ...completeRecurringTransfer, id: "rt-1", amount: 1500, reference: "Office Rent" };
    fetchSpy.mockImplementation(() => jsonResponse({ recurring_transfer: rt }));

    await runCommand("rt-1", "--output", "yaml");

    const output = writtenOutput.join("");
    expect(output).toContain("Office Rent");
    expect(output).toContain("1500");
  });

  it("calls the correct API endpoint with encoded ID", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse({ recurring_transfer: { ...completeRecurringTransfer, id: "a/b" } }),
    );

    await runCommand("a/b", "--output", "json");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers/a%2Fb");
  });
});
