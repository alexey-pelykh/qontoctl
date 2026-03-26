// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command, Option } from "commander";
import { jsonResponse } from "@qontoctl/core/testing";
import { registerBulkTransferCommands } from "./index.js";
import { OUTPUT_FORMATS } from "../../options.js";

/**
 * Create a lightweight test program with only the global options and
 * bulk-transfer commands registered.  This avoids the expensive dynamic
 * import of the full program module (which loads every command module)
 * that can exceed the per-test timeout on slower CI runners (e.g. Windows).
 */
function createTestProgram(): Command {
  const program = new Command();
  program
    .addOption(new Option("-o, --output <format>", "output format").choices([...OUTPUT_FORMATS]).default("table"))
    .addOption(new Option("--no-paginate", "disable auto-pagination"));
  registerBulkTransferCommands(program);
  program.exitOverride();
  return program;
}

describe("bulk-transfer show command", () => {
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
    await program.parseAsync(["node", "qontoctl", "bulk-transfer", "show", ...args]);
  }

  const completeBulkTransfer = {
    id: "bt-123",
    initiator_id: "user-1",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    total_count: 2,
    completed_count: 1,
    pending_count: 0,
    failed_count: 1,
    results: [
      {
        client_transfer_id: "ct-1",
        transfer_id: "txfr-1",
        status: "completed",
        errors: null,
      },
      {
        client_transfer_id: "ct-2",
        transfer_id: "txfr-2",
        status: "failed",
        errors: null,
      },
    ],
  };

  it("fetches a bulk transfer by ID", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ bulk_transfer: completeBulkTransfer }));

    await runCommand("bt-123", "--output", "json");

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/bulk_transfers/bt-123");

    const parsed = JSON.parse(writtenOutput.join(""));
    expect(parsed).toEqual(completeBulkTransfer);
  });

  it("outputs yaml format for single bulk transfer", async () => {
    const bt = { ...completeBulkTransfer, id: "bt-1", total_count: 5 };
    fetchSpy.mockImplementation(() => jsonResponse({ bulk_transfer: bt }));

    await runCommand("bt-1", "--output", "yaml");

    const output = writtenOutput.join("");
    expect(output).toContain("bt-1");
    expect(output).toContain("5");
  });

  it("calls the correct API endpoint with encoded ID", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ bulk_transfer: { ...completeBulkTransfer, id: "a/b" } }));

    await runCommand("a/b", "--output", "json");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/bulk_transfers/a%2Fb");
  });
});
