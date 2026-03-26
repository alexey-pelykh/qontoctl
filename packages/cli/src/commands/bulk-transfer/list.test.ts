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

describe("bulk-transfer list command", () => {
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
    await program.parseAsync(["node", "qontoctl", "bulk-transfer", "list", ...args]);
  }

  it("sends request to /v2/sepa/bulk_transfers", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ bulk_transfers: [], meta: makeMeta() }));

    await runCommand();

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/bulk_transfers");
  });

  it("outputs JSON when --output json", async () => {
    const bulkTransfers = [
      {
        id: "bt-1",
        initiator_id: "user-1",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-01T00:00:00.000Z",
        total_count: 3,
        completed_count: 2,
        pending_count: 1,
        failed_count: 0,
      },
    ];
    fetchSpy.mockImplementation(() =>
      jsonResponse({ bulk_transfers: bulkTransfers, meta: makeMeta({ total_count: 1 }) }),
    );

    await runCommand("--output", "json");

    expect(writtenOutput.length).toBeGreaterThan(0);
    const parsed = JSON.parse(writtenOutput.join(""));
    expect(parsed).toEqual(bulkTransfers);
  });

  it("outputs table rows with selected columns", async () => {
    const bulkTransfers = [
      {
        id: "bt-1",
        initiator_id: "user-1",
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-01T00:00:00.000Z",
        total_count: 3,
        completed_count: 2,
        pending_count: 1,
        failed_count: 0,
      },
    ];
    fetchSpy.mockImplementation(() =>
      jsonResponse({ bulk_transfers: bulkTransfers, meta: makeMeta({ total_count: 1 }) }),
    );

    await runCommand("--output", "table");

    const output = writtenOutput.join("");
    expect(output).toContain("bt-1");
    expect(output).toContain("3");
    expect(output).not.toContain("user-1");
  });
});
