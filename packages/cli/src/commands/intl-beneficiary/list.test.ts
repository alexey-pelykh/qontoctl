// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command, Option } from "commander";
import { jsonResponse } from "@qontoctl/core/testing";
import { registerIntlBeneficiaryCommands } from "./index.js";
import { OUTPUT_FORMATS } from "../../options.js";
import type { PaginationMeta } from "../../pagination.js";

function makeMeta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
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

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../../client.js";
import { HttpClient } from "@qontoctl/core";

/**
 * Create a lightweight test program with only the global options and
 * intl-beneficiary commands registered.  This avoids the expensive dynamic
 * import of the full program module (which loads every command module)
 * that can exceed the per-test timeout on slower CI runners (e.g. Windows).
 */
function createTestProgram(): Command {
  const program = new Command();
  program
    .addOption(new Option("-o, --output <format>", "output format").choices([...OUTPUT_FORMATS]).default("table"))
    .addOption(new Option("--page <number>", "fetch a specific page of results").argParser(parsePositiveInt))
    .addOption(new Option("--per-page <number>", "number of results per page").argParser(parsePositiveInt))
    .addOption(new Option("--no-paginate", "disable auto-pagination"));
  registerIntlBeneficiaryCommands(program);
  program.exitOverride();
  return program;
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got "${value}".`);
  }
  return parsed;
}

describe("intl beneficiary list command", () => {
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

  it("lists intl beneficiaries in table format", async () => {
    const international_beneficiaries = [
      { id: "intl-ben-1", name: "Global Corp", country: "US", currency: "USD" },
      { id: "intl-ben-2", name: "Euro GmbH", country: "DE", currency: "EUR" },
    ];
    fetchSpy.mockImplementation(() =>
      jsonResponse({
        international_beneficiaries,
        meta: makeMeta({ total_count: 2 }),
      }),
    );

    const program = createTestProgram();

    await program.parseAsync(["intl", "beneficiary", "list"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("intl-ben-1");
    expect(output).toContain("Global Corp");
    expect(output).toContain("intl-ben-2");
    expect(output).toContain("Euro GmbH");
  });

  it("lists intl beneficiaries in json format", async () => {
    const international_beneficiaries = [{ id: "intl-ben-1", name: "Global Corp", country: "US", currency: "USD" }];
    fetchSpy.mockImplementation(() =>
      jsonResponse({
        international_beneficiaries,
        meta: makeMeta({ total_count: 1 }),
      }),
    );

    const program = createTestProgram();

    await program.parseAsync(["--output", "json", "intl", "beneficiary", "list"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as unknown[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(international_beneficiaries[0]);
  });

  it("passes pagination options to API", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse({
        international_beneficiaries: [],
        meta: makeMeta(),
      }),
    );

    const program = createTestProgram();

    await program.parseAsync(["--page", "2", "--per-page", "50", "intl", "beneficiary", "list"], { from: "user" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("50");
  });

  it("calls the correct API endpoint", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse({
        international_beneficiaries: [],
        meta: makeMeta(),
      }),
    );

    const program = createTestProgram();

    await program.parseAsync(["intl", "beneficiary", "list"], { from: "user" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/international/beneficiaries");
  });
});
