// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../../client.js";
import { HttpClient } from "@qontoctl/core";

describe("beneficiary untrust command", () => {
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

  it("untrusts a single beneficiary in text format", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({}));

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["beneficiary", "untrust", "ben-1"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Untrusted 1 beneficiary.");
  });

  it("untrusts multiple beneficiaries in text format", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({}));

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["beneficiary", "untrust", "ben-1", "ben-2"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("Untrusted 2 beneficiaries.");
  });

  it("outputs json confirmation", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({}));

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--output", "json", "beneficiary", "untrust", "ben-1", "ben-2"], { from: "user" });

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as { untrusted: boolean; ids: string[] };
    expect(parsed.untrusted).toBe(true);
    expect(parsed.ids).toEqual(["ben-1", "ben-2"]);
  });

  it("sends POST with ids to the correct endpoint", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({}));

    const { createProgram } = await import("../../program.js");
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["beneficiary", "untrust", "ben-1"], { from: "user" });

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries/untrust");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string) as { ids: string[] };
    expect(body.ids).toEqual(["ben-1"]);
  });
});
