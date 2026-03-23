// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../../client.js";
import { HttpClient } from "@qontoctl/core";

describe("beneficiary show command", () => {
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

  it("shows beneficiary details in table format", async () => {
    const beneficiary = {
      id: "ben-1",
      name: "Acme Corp",
      iban: "FR7630001007941234567890185",
      bic: "BNPAFRPP",
      email: "acme@example.com",
      activity_tag: "consulting",
      status: "validated",
      trusted: true,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    };
    fetchSpy.mockImplementation(() => jsonResponse({ beneficiary }));

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["beneficiary", "show", "ben-1"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("ben-1");
    expect(output).toContain("Acme Corp");
  });

  it("shows beneficiary in json format", async () => {
    const beneficiary = {
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
    };
    fetchSpy.mockImplementation(() => jsonResponse({ beneficiary }));

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--output", "json", "beneficiary", "show", "ben-1"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed).toEqual(beneficiary);
  });

  it("calls the correct API endpoint", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse({
        beneficiary: {
          id: "ben-1",
          name: "Test",
          iban: "FR7630001007941234567890185",
          bic: "BNPAFRPP",
          email: null,
          activity_tag: null,
          status: "validated",
          trusted: false,
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T00:00:00.000Z",
        },
      }),
    );

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["beneficiary", "show", "ben-1"], { from: "user" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries/ben-1");
  });
});
