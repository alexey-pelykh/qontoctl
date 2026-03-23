// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
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

describe("beneficiary list command", () => {
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

  it("lists beneficiaries in table format", async () => {
    const beneficiaries = [
      {
        id: "ben-1",
        name: "Acme Corp",
        iban: "FR7630001007941234567890185",
        bic: "BNPAFRPP",
        email: null,
        activity_tag: null,
        status: "validated",
        trusted: true,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
      {
        id: "ben-2",
        name: "Test LLC",
        iban: "DE89370400440532013000",
        bic: "COBADEFFXXX",
        email: "test@example.com",
        activity_tag: "consulting",
        status: "pending",
        trusted: false,
        created_at: "2025-02-01T00:00:00.000Z",
        updated_at: "2025-02-01T00:00:00.000Z",
      },
    ];
    fetchSpy.mockImplementation(() =>
      jsonResponse({
        beneficiaries,
        meta: makeMeta({ total_count: 2 }),
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["beneficiary", "list"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("ben-1");
    expect(output).toContain("Acme Corp");
    expect(output).toContain("ben-2");
    expect(output).toContain("Test LLC");
  });

  it("lists beneficiaries in json format", async () => {
    const beneficiaries = [
      {
        id: "ben-1",
        name: "Acme Corp",
        iban: "FR7630001007941234567890185",
        bic: "BNPAFRPP",
        email: null,
        activity_tag: null,
        status: "validated",
        trusted: true,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    ];
    fetchSpy.mockImplementation(() =>
      jsonResponse({
        beneficiaries,
        meta: makeMeta({ total_count: 1 }),
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--output", "json", "beneficiary", "list"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as unknown[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(beneficiaries[0]);
  });

  it("passes filter options to API", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse({
        beneficiaries: [],
        meta: makeMeta(),
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["beneficiary", "list", "--status", "validated", "--trusted"], { from: "user" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("status[]")).toEqual(["validated"]);
    expect(url.searchParams.get("trusted")).toBe("true");
  });

  it("passes pagination options to API", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse({
        beneficiaries: [],
        meta: makeMeta(),
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--page", "2", "--per-page", "50", "beneficiary", "list"], { from: "user" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("50");
  });

  it("calls the correct API endpoint", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse({
        beneficiaries: [],
        meta: makeMeta(),
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["beneficiary", "list"], { from: "user" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries");
  });
});
