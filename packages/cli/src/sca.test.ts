// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient, QontoScaRequiredError } from "@qontoctl/core";
import { jsonResponse } from "@qontoctl/core/testing";
import { executeWithCliSca } from "./sca.js";

class TestableHttpClient extends HttpClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected override sleep(_ms: number): Promise<void> {
    return Promise.resolve();
  }
}

describe("executeWithCliSca", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: TestableHttpClient;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  const noopSleep = () => Promise.resolve();

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new TestableHttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes through when no SCA error occurs", async () => {
    const result = await executeWithCliSca(client, async () => "success", { poll: { sleep: noopSleep } });

    expect(result).toBe("success");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("displays SCA prompt on stderr when SCA is required", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    let called = false;

    await executeWithCliSca(
      client,
      async () => {
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-cli-1");
        }
        return "ok";
      },
      { poll: { sleep: noopSleep } },
    );

    const output = stderrSpy.mock.calls.map((c) => c[0] as string).join("");
    expect(output).toContain("SCA required. Please approve on your Qonto mobile app...");
  });

  it("displays approval message on stderr", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    let called = false;

    await executeWithCliSca(
      client,
      async () => {
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-cli-2");
        }
        return "ok";
      },
      { poll: { sleep: noopSleep } },
    );

    const output = stderrSpy.mock.calls.map((c) => c[0] as string).join("");
    expect(output).toContain("SCA approved. Retrying request...");
  });

  it("logs polling attempts in verbose mode", async () => {
    fetchSpy
      .mockReturnValueOnce(jsonResponse({ sca_session: { status: "waiting" } }))
      .mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    let called = false;

    await executeWithCliSca(
      client,
      async () => {
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-cli-3");
        }
        return "ok";
      },
      { verbose: true, poll: { sleep: noopSleep } },
    );

    const output = stderrSpy.mock.calls.map((c) => c[0] as string).join("");
    expect(output).toContain("SCA polling attempt 1");
    expect(output).toContain("elapsed");
  });

  it("does not log polling attempts when verbose is false", async () => {
    fetchSpy
      .mockReturnValueOnce(jsonResponse({ sca_session: { status: "waiting" } }))
      .mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    let called = false;

    await executeWithCliSca(
      client,
      async () => {
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-cli-4");
        }
        return "ok";
      },
      { poll: { sleep: noopSleep } },
    );

    const output = stderrSpy.mock.calls.map((c) => c[0] as string).join("");
    expect(output).not.toContain("SCA polling attempt");
  });

  it("retries original operation with SCA token after approval", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    let callCount = 0;

    const result = await executeWithCliSca(
      client,
      async (scaToken) => {
        callCount++;
        if (callCount === 1) {
          throw new QontoScaRequiredError("tok-cli-5");
        }
        return `result-with-${scaToken ?? "none"}`;
      },
      { poll: { sleep: noopSleep } },
    );

    expect(result).toBe("result-with-tok-cli-5");
  });
});
