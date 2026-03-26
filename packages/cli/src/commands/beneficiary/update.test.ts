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

const sampleBeneficiary = {
  id: "ben-1",
  name: "Updated Corp",
  iban: "FR7630001007941234567890185",
  bic: "BNPAFRPP",
  email: null,
  activity_tag: null,
  status: "validated",
  trusted: true,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
};

describe("beneficiary update command", () => {
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

  it("updates a beneficiary in table format", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ beneficiary: sampleBeneficiary }));

    const program = createTestProgram();

    await program.parseAsync(["beneficiary", "update", "ben-1", "--name", "Updated Corp"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("ben-1");
    expect(output).toContain("Updated Corp");
  });

  it("updates a beneficiary in json format", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ beneficiary: sampleBeneficiary }));

    const program = createTestProgram();

    await program.parseAsync(["--output", "json", "beneficiary", "update", "ben-1", "--name", "Updated Corp"], {
      from: "user",
    });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed).toEqual(sampleBeneficiary);
  });

  it("sends PUT to the correct endpoint with body", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ beneficiary: sampleBeneficiary }));

    const program = createTestProgram();

    await program.parseAsync(["beneficiary", "update", "ben-1", "--name", "Updated Corp"], { from: "user" });

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries/ben-1");
    expect(opts.method).toBe("PUT");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      beneficiary: {
        name: "Updated Corp",
      },
    });
  });
});
