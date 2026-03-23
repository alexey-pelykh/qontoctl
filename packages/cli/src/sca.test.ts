// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient, QontoScaRequiredError, ScaTimeoutError } from "@qontoctl/core";
import { jsonResponse } from "@qontoctl/core/testing";
import { executeWithCliSca } from "./sca.js";

class TestableHttpClient extends HttpClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected override sleep(_ms: number): Promise<void> {
    return Promise.resolve();
  }
}

function createMockSpinner() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    clear: vi.fn(),
    isCancelled: false,
  };
}

describe("executeWithCliSca", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: TestableHttpClient;
  const noopSleep = () => Promise.resolve();

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new TestableHttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes through when no SCA error occurs", async () => {
    const mockSpin = createMockSpinner();
    const result = await executeWithCliSca(client, async () => "success", {
      poll: { sleep: noopSleep },
      createSpinner: () => mockSpin,
    });

    expect(result).toBe("success");
    expect(mockSpin.start).not.toHaveBeenCalled();
  });

  it("starts spinner when SCA is required", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    const mockSpin = createMockSpinner();
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
      { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
    );

    expect(mockSpin.start).toHaveBeenCalledWith("Waiting for SCA approval on your Qonto mobile app...");
  });

  it("stops spinner with success message on approval", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    const mockSpin = createMockSpinner();
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
      { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
    );

    expect(mockSpin.stop).toHaveBeenCalledWith("SCA approved");
  });

  it("updates spinner message with elapsed time on each poll", async () => {
    fetchSpy
      .mockReturnValueOnce(jsonResponse({ sca_session: { status: "waiting" } }))
      .mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    const mockSpin = createMockSpinner();
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
      { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
    );

    expect(mockSpin.message).toHaveBeenCalled();
    const firstCall = mockSpin.message.mock.calls[0]?.[0] as string;
    expect(firstCall).toMatch(/Waiting for SCA approval on your Qonto mobile app\.\.\. \(\d+s\)/);
  });

  it("stops spinner with error message on timeout", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "waiting" } }));
    const mockSpin = createMockSpinner();
    let called = false;

    await expect(
      executeWithCliSca(
        client,
        async () => {
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-cli-timeout");
          }
          return "ok";
        },
        {
          poll: { sleep: noopSleep, timeoutMs: 0 },
          createSpinner: () => mockSpin,
        },
      ),
    ).rejects.toThrow(ScaTimeoutError);

    expect(mockSpin.error).toHaveBeenCalledWith("SCA approval timed out");
  });

  it("stops spinner with error message on denial", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "deny" } }));
    const mockSpin = createMockSpinner();
    let called = false;

    await expect(
      executeWithCliSca(
        client,
        async () => {
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-cli-deny");
          }
          return "ok";
        },
        { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
      ),
    ).rejects.toThrow();

    expect(mockSpin.error).toHaveBeenCalledWith("SCA approval failed");
  });

  it("retries original operation with SCA token after approval", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    const mockSpin = createMockSpinner();
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
      { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
    );

    expect(result).toBe("result-with-tok-cli-5");
  });
});
