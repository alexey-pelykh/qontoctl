// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";

vi.mock("../../client.js", async () => {
  const { HttpClient } = await import("@qontoctl/core");
  return {
    createClient: vi.fn().mockResolvedValue(
      new HttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "test-org:test-secret",
      }),
    ),
  };
});

describe("sca-session show command", () => {
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
    program.exitOverride();
    await program.parseAsync(["node", "qontoctl", "sca-session", "show", ...args]);
  }

  it("fetches an SCA session by token (waiting status)", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "waiting" } }));

    await runCommand("tok-abc", "--output", "json");

    expect(fetchSpy).toHaveBeenCalled();
    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sca/sessions/tok-abc");
    expect(init.method).toBe("GET");

    const parsed = JSON.parse(writtenOutput.join("")) as { token: string; status: string };
    expect(parsed).toEqual({ token: "tok-abc", status: "waiting" });
  });

  it("returns allow status", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "allow" } }));

    await runCommand("tok-allow", "--output", "json");

    const parsed = JSON.parse(writtenOutput.join("")) as { token: string; status: string };
    expect(parsed.status).toBe("allow");
  });

  it("returns deny status", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "deny" } }));

    await runCommand("tok-deny", "--output", "json");

    const parsed = JSON.parse(writtenOutput.join("")) as { token: string; status: string };
    expect(parsed.status).toBe("deny");
  });

  it("outputs yaml format", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "waiting" } }));

    await runCommand("tok-yaml", "--output", "yaml");

    const output = writtenOutput.join("");
    expect(output).toContain("token: tok-yaml");
    expect(output).toContain("status: waiting");
  });

  it("outputs table format with token and status columns", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "waiting" } }));

    await runCommand("tok-table");

    const output = writtenOutput.join("");
    expect(output).toContain("tok-table");
    expect(output).toContain("waiting");
  });

  it("encodes the token in the URL", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "waiting" } }));

    await runCommand("tok/with&chars", "--output", "json");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sca/sessions/tok%2Fwith%26chars");
  });

  it("propagates network/API errors", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse(
        {
          errors: [{ status: "404", code: "not_found", title: "Not Found", detail: "session not found" }],
        },
        { status: 404 },
      ),
    );

    await expect(runCommand("tok-missing", "--output", "json")).rejects.toThrow();
  });
});
