// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { registerTransferCommands } from "./index.js";

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

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    registerTransferCommands(program);
    program.exitOverride();
    await program.parseAsync(["node", "qontoctl", "transfer", "show", ...args]);
  }

  it("fetches a transfer by ID", async () => {
    const transfer = {
      id: "txfr-123",
      beneficiary_id: "ben-1",
      amount: 100.5,
      amount_currency: "EUR",
      status: "settled",
      reference: "Invoice 001",
    };
    fetchSpy.mockReturnValue(jsonResponse({ transfer }));

    await runCommand("txfr-123", "--output", "json");

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/txfr-123");

    const parsed = JSON.parse(writtenOutput.join(""));
    expect(parsed).toEqual(transfer);
  });

  it("outputs yaml format for single transfer", async () => {
    const transfer = {
      id: "txfr-1",
      beneficiary_id: "ben-1",
      amount: 1500,
      reference: "Office Rent",
    };
    fetchSpy.mockReturnValue(jsonResponse({ transfer }));

    await runCommand("txfr-1", "--output", "yaml");

    const output = writtenOutput.join("");
    expect(output).toContain("Office Rent");
    expect(output).toContain("1500");
  });

  it("calls the correct API endpoint with encoded ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transfer: { id: "a/b" } }));

    await runCommand("a/b", "--output", "json");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/a%2Fb");
  });
});
