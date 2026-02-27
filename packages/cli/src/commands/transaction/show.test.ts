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

describe("transaction show command", () => {
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
    await program.parseAsync(["node", "qontoctl", "transaction", "show", ...args]);
  }

  it("registers transaction show command", () => {
    const program = createProgram();
    const txn = program.commands.find((c) => c.name() === "transaction");
    expect(txn).toBeDefined();
    const show = txn?.commands.find((c) => c.name() === "show");
    expect(show).toBeDefined();
  });

  it("fetches a transaction by ID", async () => {
    const txn = {
      id: "txn-123",
      label: "Coffee Shop",
      amount: 4.5,
      side: "debit",
    };
    fetchSpy.mockReturnValue(jsonResponse({ transaction: txn }));

    await runCommand("txn-123", "--output", "json");

    expect(fetchSpy).toHaveBeenCalled();
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/transactions/txn-123");

    const parsed = JSON.parse(writtenOutput.join(""));
    expect(parsed).toEqual(txn);
  });

  it("passes includes as query params", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({ transaction: { id: "txn-1" } }),
    );

    await runCommand("txn-1", "--include", "labels", "attachments");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("includes[]")).toEqual([
      "labels",
      "attachments",
    ]);
  });

  it("outputs yaml format for single transaction", async () => {
    const txn = {
      id: "txn-1",
      label: "Office Rent",
      amount: 1500,
    };
    fetchSpy.mockReturnValue(jsonResponse({ transaction: txn }));

    await runCommand("txn-1", "--output", "yaml");

    const output = writtenOutput.join("");
    expect(output).toContain("Office Rent");
    expect(output).toContain("1500");
  });
});
