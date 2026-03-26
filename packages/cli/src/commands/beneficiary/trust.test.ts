// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { Command, Option } from "commander";
import { registerBeneficiaryCommands } from "./index.js";
import { OUTPUT_FORMATS } from "../../options.js";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../../client.js";
import { HttpClient } from "@qontoctl/core";

/**
 * Create a lightweight test program with only the global options and
 * beneficiary commands registered.  This avoids the expensive dynamic
 * import of the full program module (which loads every command module)
 * that can exceed the per-test timeout on slower CI runners (e.g. Windows).
 */
function createTestProgram(): Command {
  const program = new Command();
  program
    .addOption(new Option("-o, --output <format>", "output format").choices([...OUTPUT_FORMATS]).default("table"))
    .addOption(new Option("--no-paginate", "disable auto-pagination"));
  registerBeneficiaryCommands(program);
  program.exitOverride();
  return program;
}

describe("beneficiary trust command", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("trusts a single beneficiary in text format", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({}));

    const program = createTestProgram();

    await program.parseAsync(["beneficiary", "trust", "ben-1"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Trusted 1 beneficiary.");
  });

  it("trusts multiple beneficiaries in text format", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({}));

    const program = createTestProgram();

    await program.parseAsync(["beneficiary", "trust", "ben-1", "ben-2"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Trusted 2 beneficiaries.");
  });

  it("outputs json confirmation", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({}));

    const program = createTestProgram();

    await program.parseAsync(["--output", "json", "beneficiary", "trust", "ben-1", "ben-2"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as { trusted: boolean; ids: string[] };
    expect(parsed.trusted).toBe(true);
    expect(parsed.ids).toEqual(["ben-1", "ben-2"]);
  });

  it("sends POST with ids to the correct endpoint", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({}));

    const program = createTestProgram();

    await program.parseAsync(["beneficiary", "trust", "ben-1"], { from: "user" });

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries/trust");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string) as { ids: string[] };
    expect(body.ids).toEqual(["ben-1"]);
  });
});
