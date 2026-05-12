// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient, QontoScaNotEnrolledError, QontoScaRequiredError, ScaTimeoutError } from "@qontoctl/core";
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
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "allow" } }));
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
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "allow" } }));
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
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "waiting" } }));
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
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "deny" } }));
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
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "allow" } }));
    const mockSpin = createMockSpinner();
    let callCount = 0;

    const result = await executeWithCliSca(
      client,
      async ({ scaSessionToken }) => {
        callCount++;
        if (callCount === 1) {
          throw new QontoScaRequiredError("tok-cli-5");
        }
        return `result-with-${scaSessionToken ?? "none"}`;
      },
      { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
    );

    expect(result).toBe("result-with-tok-cli-5");
  });

  it("forwards a stable idempotency key across both attempts", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "allow" } }));
    const mockSpin = createMockSpinner();
    const seenKeys: string[] = [];
    let called = false;

    await executeWithCliSca(
      client,
      async ({ idempotencyKey }) => {
        seenKeys.push(idempotencyKey);
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-cli-idem");
        }
        return "ok";
      },
      { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
    );

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).toBe(seenKeys[1]);
  });

  it("propagates QontoScaNotEnrolledError without starting the spinner", async () => {
    // Configuration error: not a recoverable challenge. The CLI must not show
    // a spinner that suggests waiting for approval.
    const mockSpin = createMockSpinner();
    const error = new QontoScaNotEnrolledError([
      { code: "sca_not_enrolled", detail: "You must enable SCA to perform this action" },
    ]);

    const caught = await executeWithCliSca(
      client,
      async () => {
        throw error;
      },
      { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
    ).catch((e: unknown) => e);

    expect(caught).toBe(error);
    expect(mockSpin.start).not.toHaveBeenCalled();
    expect(mockSpin.message).not.toHaveBeenCalled();
    expect(mockSpin.stop).not.toHaveBeenCalled();
    expect(mockSpin.error).not.toHaveBeenCalled();
  });

  it("forwards a supplied idempotency key to the operation", async () => {
    fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "allow" } }));
    const mockSpin = createMockSpinner();
    const seenKeys: string[] = [];
    let called = false;

    await executeWithCliSca(
      client,
      async ({ idempotencyKey }) => {
        seenKeys.push(idempotencyKey);
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-cli-idem-supplied");
        }
        return "ok";
      },
      { poll: { sleep: noopSleep }, createSpinner: () => mockSpin, idempotencyKey: "cli-supplied-key" },
    );

    expect(seenKeys).toEqual(["cli-supplied-key", "cli-supplied-key"]);
  });

  describe("scaAutoApprove", () => {
    function createSandboxClient(scaMethod?: string): TestableHttpClient {
      return new TestableHttpClient({
        baseUrl: "https://thirdparty-sandbox.staging.qonto.co",
        authorization: "slug:secret",
        stagingToken: "tok-staging",
        ...(scaMethod !== undefined ? { scaMethod } : {}),
      });
    }

    it("throws synchronously when scaAutoApprove is set against a production (non-sandbox) client", async () => {
      // AC #2: --sca-auto-approve must be rejected against production paths.
      // The check fires BEFORE any wire request so the error reaches the user
      // up-front instead of as a confusing 404 from Qonto.
      const productionClient = client;
      const mockSpin = createMockSpinner();

      await expect(
        executeWithCliSca(productionClient, async () => "should-not-run", {
          poll: { sleep: noopSleep },
          createSpinner: () => mockSpin,
          scaAutoApprove: "allow",
        }),
      ).rejects.toThrow(/--sca-auto-approve is only available in the Qonto sandbox/);

      // No wire request must be issued — the gate fires up-front.
      expect(fetchSpy).not.toHaveBeenCalled();
      // No spinner should be started either.
      expect(mockSpin.start).not.toHaveBeenCalled();
    });

    it("explicit scaAutoApprove='allow' fires mock-decision then succeeds against sandbox", async () => {
      // AC #1: --sca-auto-approve allow accepted; AC #5: end-to-end success.
      const sandboxClient = createSandboxClient("mock");
      const mockSpin = createMockSpinner();
      let called = false;

      // Sequence: 428 → POST allow (204) → poll allow (sandbox shape) → retry 200.
      fetchSpy
        .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })))
        .mockImplementationOnce(() => jsonResponse({ result: "allow" }));

      const result = await executeWithCliSca(
        sandboxClient,
        async ({ scaSessionToken }) => {
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-explicit-allow");
          }
          return `retried-with-${scaSessionToken ?? "none"}`;
        },
        {
          poll: { sleep: noopSleep },
          createSpinner: () => mockSpin,
          scaAutoApprove: "allow",
        },
      );

      expect(result).toBe("retried-with-tok-explicit-allow");
      const [decisionUrl, decisionInit] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(decisionUrl.pathname).toBe("/v2/mocked_sca_sessions/tok-explicit-allow/allow");
      expect((decisionInit.method ?? "GET").toUpperCase()).toBe("POST");
    });

    it("auto-defaults to 'allow' when isMockSca is true and scaAutoApprove is undefined", async () => {
      // AC #3: implicit --sca-auto-approve allow when staging-token + sca.method
      // 'mock' are both active.
      const sandboxMockClient = createSandboxClient("mock");
      const mockSpin = createMockSpinner();
      let called = false;

      fetchSpy
        .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })))
        .mockImplementationOnce(() => jsonResponse({ result: "allow" }));

      await executeWithCliSca(
        sandboxMockClient,
        async () => {
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-auto-default");
          }
          return "ok";
        },
        { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
      );

      // First wire call must be the mock-decision allow POST.
      const [decisionUrl] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(decisionUrl.pathname).toBe("/v2/mocked_sca_sessions/tok-auto-default/allow");
    });

    it("does NOT auto-default when scaMethod is not 'mock' (sandbox without mock path)", async () => {
      // Sandbox-routed but scaMethod resolved to 'paired-device' (or unset) —
      // the user explicitly opted out of mock SCA, so auto-default must not fire.
      // (Note: the sandbox POLL endpoint is still /v2/mocked_sca_sessions/<token>,
      // because the SCA session itself is mocked in sandbox regardless of
      // client.scaMethod. The thing that must NOT fire is the DECISION POST
      // to /v2/mocked_sca_sessions/<token>/{allow,deny}.)
      const sandboxNonMockClient = createSandboxClient("paired-device");
      const mockSpin = createMockSpinner();
      let called = false;

      // Sandbox-shape poll response.
      fetchSpy.mockImplementation(() => jsonResponse({ result: "allow" }));

      await executeWithCliSca(
        sandboxNonMockClient,
        async () => {
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-no-auto");
          }
          return "ok";
        },
        { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
      );

      // No DECISION POST should appear — only the poll(s) and the retry.
      for (const call of fetchSpy.mock.calls) {
        const [url, init] = call as [URL, RequestInit];
        const isDecisionPost =
          (init.method ?? "GET").toUpperCase() === "POST" &&
          /\/v2\/mocked_sca_sessions\/[^/]+\/(allow|deny)$/.test(url.pathname);
        expect(isDecisionPost).toBe(false);
      }
    });

    it("does NOT auto-default in production when scaMethod is 'mock' (defensive — isMockSca already false)", async () => {
      // Defensive layer: even if scaMethod somehow gets set to 'mock' on a
      // production client (e.g., explicit override), `isMockSca` returns false
      // because `isSandbox` is false. So auto-default must not engage.
      const productionWithMockMethod = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        scaMethod: "mock",
      });
      const mockSpin = createMockSpinner();
      let called = false;

      fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "allow" } }));

      await executeWithCliSca(
        productionWithMockMethod,
        async () => {
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-prod-no-auto");
          }
          return "ok";
        },
        { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
      );

      for (const call of fetchSpy.mock.calls) {
        const [url] = call as [URL, RequestInit];
        expect(url.pathname).not.toContain("/mocked_sca_sessions/");
      }
    });

    it("uses mock-decision spinner copy when isMockSca is true", async () => {
      // AC #4: spinner copy disambiguates real-device vs mock paths.
      const sandboxMockClient = createSandboxClient("mock");
      const mockSpin = createMockSpinner();
      let called = false;

      fetchSpy
        .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })))
        .mockImplementationOnce(() => jsonResponse({ result: "allow" }));

      await executeWithCliSca(
        sandboxMockClient,
        async () => {
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-mock-copy");
          }
          return "ok";
        },
        { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
      );

      expect(mockSpin.start).toHaveBeenCalledWith("Waiting for SCA mock-decision...");
      // Real-device copy must NOT appear in the mock path.
      expect(mockSpin.start).not.toHaveBeenCalledWith(expect.stringMatching(/Qonto mobile app/));
    });

    it("keeps real-device spinner copy when isMockSca is false (regression guard)", async () => {
      // The existing real-device copy is the default for production and for
      // sandbox-routed-but-not-mock paths. Don't regress it.
      fetchSpy.mockImplementation(() => jsonResponse({ sca_session: { status: "allow" } }));
      const mockSpin = createMockSpinner();
      let called = false;

      await executeWithCliSca(
        client,
        async () => {
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-real-copy");
          }
          return "ok";
        },
        { poll: { sleep: noopSleep }, createSpinner: () => mockSpin },
      );

      expect(mockSpin.start).toHaveBeenCalledWith("Waiting for SCA approval on your Qonto mobile app...");
    });
  });
});
