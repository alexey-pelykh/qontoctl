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

describe("transfer show command", () => {
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
    await program.parseAsync(["node", "qontoctl", "transfer", "show", ...args]);
  }

  const completeTransfer = {
    id: "txfr-123",
    initiator_id: "user-1",
    bank_account_id: "ba-1",
    beneficiary_id: "ben-1",
    amount: 100.5,
    amount_cents: 10050,
    amount_currency: "EUR",
    status: "settled",
    reference: "Invoice 001",
    note: null,
    scheduled_date: "2025-03-01",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    processed_at: "2025-01-02T00:00:00Z",
    completed_at: "2025-01-03T00:00:00Z",
    transaction_id: "txn-1",
    recurring_transfer_id: null,
    declined_reason: null,
  };

  it("fetches a transfer by ID", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ transfer: completeTransfer }));

    await runCommand("txfr-123", "--output", "json");

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/txfr-123");

    const parsed = JSON.parse(writtenOutput.join(""));
    expect(parsed).toEqual(completeTransfer);
  });

  it("outputs yaml format for single transfer", async () => {
    const transfer = { ...completeTransfer, id: "txfr-1", amount: 1500, reference: "Office Rent" };
    fetchSpy.mockImplementation(() => jsonResponse({ transfer }));

    await runCommand("txfr-1", "--output", "yaml");

    const output = writtenOutput.join("");
    expect(output).toContain("Office Rent");
    expect(output).toContain("1500");
  });

  it("calls the correct API endpoint with encoded ID", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ transfer: { ...completeTransfer, id: "a/b" } }));

    await runCommand("a/b", "--output", "json");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/a%2Fb");
  });
});
