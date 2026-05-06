// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient, QontoScaRequiredError, ScaDeniedError, ScaTimeoutError } from "@qontoctl/core";
import { jsonResponse } from "@qontoctl/core/testing";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { executeWithMcpSca } from "./sca.js";

class TestableHttpClient extends HttpClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected override sleep(_ms: number): Promise<void> {
    return Promise.resolve();
  }
}

const noopSleep = () => Promise.resolve();

function formatStringSuccess(result: string): CallToolResult {
  return {
    content: [{ type: "text" as const, text: result }],
    isError: false,
  };
}

function getText(result: CallToolResult): string {
  const first = result.content[0];
  if (first === undefined || first.type !== "text") {
    throw new Error("expected first content to be text");
  }
  return first.text;
}

describe("executeWithMcpSca", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: TestableHttpClient;

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

  describe("happy path", () => {
    it("invokes formatSuccess with the operation result when no SCA is required", async () => {
      const formatSuccess = vi.fn(formatStringSuccess);

      const result = await executeWithMcpSca(client, async () => "ok", formatSuccess, {
        poll: { sleep: noopSleep },
      });

      expect(formatSuccess).toHaveBeenCalledOnce();
      expect(formatSuccess).toHaveBeenCalledWith("ok");
      expect(result.isError).toBe(false);
      expect(getText(result)).toBe("ok");
    });
  });

  describe("with wait > 0 (default 30s polling path)", () => {
    it("polls and retries with the SCA token on approval, returning formatSuccess", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
      let callCount = 0;

      const result = await executeWithMcpSca(
        client,
        async ({ scaSessionToken }) => {
          callCount++;
          if (callCount === 1) {
            throw new QontoScaRequiredError("tok-mcp-success");
          }
          return `retried-with-${scaSessionToken ?? "none"}`;
        },
        formatStringSuccess,
        { wait: 10, poll: { sleep: noopSleep } },
      );

      expect(callCount).toBe(2);
      expect(getText(result)).toBe("retried-with-tok-mcp-success");
      expect(result.isError).toBe(false);
    });

    it("returns SCA-denied response when the user denies", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "deny" } }));
      let callCount = 0;

      const result = await executeWithMcpSca(
        client,
        async () => {
          callCount++;
          throw new QontoScaRequiredError("tok-mcp-deny");
        },
        formatStringSuccess,
        { wait: 10, poll: { sleep: noopSleep } },
      );

      expect(callCount).toBe(1);
      const text = getText(result);
      expect(text).toContain("SCA denied");
      expect(text).toContain("rejected the approval");
      expect(result.isError).toBe(false);
    });
  });

  describe("with wait = 0 (pure two-step, no polling)", () => {
    it("returns SCA-pending response immediately on 428 without polling", async () => {
      let callCount = 0;

      const result = await executeWithMcpSca(
        client,
        async () => {
          callCount++;
          throw new QontoScaRequiredError("tok-mcp-wait0");
        },
        formatStringSuccess,
        { wait: 0 },
      );

      expect(callCount).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      const text = getText(result);
      expect(text).toContain("tok-mcp-wait0");
      expect(text).toContain("No inline poll was requested");
      expect(result.isError).toBe(false);
    });

    it("invokes formatSuccess if the operation succeeds without SCA when wait=0", async () => {
      const result = await executeWithMcpSca(client, async () => "ok-no-sca", formatStringSuccess, {
        wait: 0,
      });

      expect(getText(result)).toBe("ok-no-sca");
    });
  });

  describe("with wait = false (pure two-step, no polling)", () => {
    it("returns SCA-pending response immediately on 428 without polling", async () => {
      let callCount = 0;

      const result = await executeWithMcpSca(
        client,
        async () => {
          callCount++;
          throw new QontoScaRequiredError("tok-mcp-waitfalse");
        },
        formatStringSuccess,
        { wait: false },
      );

      expect(callCount).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      const text = getText(result);
      expect(text).toContain("tok-mcp-waitfalse");
      expect(text).toContain("No inline poll was requested");
    });

    it("invokes formatSuccess if the operation succeeds without SCA when wait=false", async () => {
      const result = await executeWithMcpSca(client, async () => "ok-false", formatStringSuccess, {
        wait: false,
      });

      expect(getText(result)).toBe("ok-false");
    });
  });

  describe("with caller-supplied scaSessionToken", () => {
    it("invokes the operation exactly once with the supplied token, no polling", async () => {
      let callCount = 0;
      let observedToken: string | undefined;

      const result = await executeWithMcpSca(
        client,
        async ({ scaSessionToken }) => {
          callCount++;
          observedToken = scaSessionToken;
          return `bound-with-${scaSessionToken ?? "none"}`;
        },
        formatStringSuccess,
        { scaSessionToken: "tok-mcp-supplied" },
      );

      expect(callCount).toBe(1);
      expect(observedToken).toBe("tok-mcp-supplied");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(getText(result)).toBe("bound-with-tok-mcp-supplied");
    });

    it("returns a pending response if the supplied token retry yields a fresh challenge", async () => {
      let callCount = 0;

      const result = await executeWithMcpSca(
        client,
        async () => {
          callCount++;
          throw new QontoScaRequiredError("tok-mcp-fresh");
        },
        formatStringSuccess,
        { scaSessionToken: "tok-mcp-supplied-stale" },
      );

      expect(callCount).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      const text = getText(result);
      expect(text).toContain("tok-mcp-fresh");
      expect(text).not.toContain("tok-mcp-supplied-stale");
    });

    it("ignores wait when scaSessionToken is supplied", async () => {
      let callCount = 0;

      await executeWithMcpSca(
        client,
        async () => {
          callCount++;
          return "ok";
        },
        formatStringSuccess,
        { wait: 60, scaSessionToken: "tok-mcp-ignores-wait" },
      );

      expect(callCount).toBe(1);
      // Polling never reached the HTTP transport.
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("error propagation", () => {
    it("rethrows non-SCA errors thrown by the operation in polling path", async () => {
      const networkError = new Error("ECONNRESET");

      await expect(
        executeWithMcpSca(
          client,
          async () => {
            throw networkError;
          },
          formatStringSuccess,
          { wait: 10, poll: { sleep: noopSleep } },
        ),
      ).rejects.toBe(networkError);
    });

    it("rethrows non-SCA errors thrown by the operation in wait=0 path", async () => {
      const apiError = new Error("validation failed");

      await expect(
        executeWithMcpSca(
          client,
          async () => {
            throw apiError;
          },
          formatStringSuccess,
          { wait: 0 },
        ),
      ).rejects.toBe(apiError);
    });

    it("rethrows non-SCA errors thrown by the operation in scaSessionToken path", async () => {
      const apiError = new Error("validation failed");

      await expect(
        executeWithMcpSca(
          client,
          async () => {
            throw apiError;
          },
          formatStringSuccess,
          { scaSessionToken: "tok-mcp-supplied-throws" },
        ),
      ).rejects.toBe(apiError);
    });
  });

  describe("ScaTimeoutError handling (synthetic from polling layer)", () => {
    it("returns SCA-pending response when polling raises ScaTimeoutError", async () => {
      // Simulate a ScaTimeoutError from the polling layer by injecting a sleep
      // that throws synchronously the second time (mimicking a polling time
      // budget exhausted before the session resolves). We bypass the polling
      // layer's actual time math by stubbing Date.now() between attempts.
      const realDateNow = Date.now;
      let now = 1_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "waiting" } }));

      const sleep = async () => {
        // Advance virtual time past timeoutMs so the next iteration trips the
        // elapsedMs >= timeoutMs check inside pollScaSession.
        now += 10_000;
      };

      const result = await executeWithMcpSca(
        client,
        async () => {
          throw new QontoScaRequiredError("tok-mcp-real-timeout");
        },
        formatStringSuccess,
        { wait: 5, poll: { sleep, intervalMs: 1 } },
      );

      const text = getText(result);
      expect(text).toContain("SCA required");
      expect(text).toContain("tok-mcp-real-timeout");
      expect(text).toContain("Polled for 5s without resolution");
      expect(text).toContain("sca_session_show");
      expect(result.isError).toBe(false);

      Date.now = realDateNow;
    });

    it("returns SCA-pending response when the post-poll retry raises a fresh 428", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
      let callCount = 0;

      const result = await executeWithMcpSca(
        client,
        async () => {
          callCount++;
          if (callCount === 1) {
            throw new QontoScaRequiredError("tok-mcp-first");
          }
          // Second attempt (after poll) re-issues a fresh challenge.
          throw new QontoScaRequiredError("tok-mcp-fresh-after-poll");
        },
        formatStringSuccess,
        { wait: 10, poll: { sleep: noopSleep } },
      );

      expect(callCount).toBe(2);
      const text = getText(result);
      expect(text).toContain("tok-mcp-fresh-after-poll");
      expect(text).not.toContain("tok-mcp-first");
      expect(text).toContain("No inline poll was requested");
      expect(result.isError).toBe(false);
    });

    it("returns SCA-denied response when polling raises ScaDeniedError directly", async () => {
      // Force ScaDeniedError without going through the operation.
      // We intercept executeWithSca by having the operation throw 428,
      // then the poll fetch returns "deny".
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "deny" } }));

      const result = await executeWithMcpSca(
        client,
        async () => {
          throw new QontoScaRequiredError("tok-mcp-direct-deny");
        },
        formatStringSuccess,
        { wait: 10, poll: { sleep: noopSleep } },
      );

      // Sanity-check the error class names match what the wrapper expects.
      expect(ScaDeniedError.name).toBe("ScaDeniedError");
      expect(ScaTimeoutError.name).toBe("ScaTimeoutError");

      const text = getText(result);
      expect(text).toContain("SCA denied");
      expect(result.isError).toBe(false);
    });
  });

  describe("response text", () => {
    it("references sca_session_show MCP tool, not the HTTP endpoint", async () => {
      const result = await executeWithMcpSca(
        client,
        async () => {
          throw new QontoScaRequiredError("tok-text-1");
        },
        formatStringSuccess,
        { wait: 0 },
      );

      const text = getText(result);
      expect(text).toContain("sca_session_show");
      expect(text).not.toContain("/v2/sca/sessions/");
      expect(text).not.toContain("Poll GET");
    });

    it("references sca_session_token continuation parameter", async () => {
      const result = await executeWithMcpSca(
        client,
        async () => {
          throw new QontoScaRequiredError("tok-text-2");
        },
        formatStringSuccess,
        { wait: 0 },
      );

      expect(getText(result)).toContain("sca_session_token");
    });

    it("includes the session token in the pending response", async () => {
      const result = await executeWithMcpSca(
        client,
        async () => {
          throw new QontoScaRequiredError("tok-text-token-included");
        },
        formatStringSuccess,
        { wait: 0 },
      );

      expect(getText(result)).toContain("tok-text-token-included");
    });

    it("indicates polling occurred when wait > 0 timed out", async () => {
      const realDateNow = Date.now;
      let now = 2_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "waiting" } }));

      const sleep = async () => {
        now += 100_000;
      };

      const result = await executeWithMcpSca(
        client,
        async () => {
          throw new QontoScaRequiredError("tok-text-polled");
        },
        formatStringSuccess,
        { wait: 7, poll: { sleep, intervalMs: 1 } },
      );

      expect(getText(result)).toContain("Polled for 7s");
      Date.now = realDateNow;
    });

    it("indicates no polling occurred when wait=false", async () => {
      const result = await executeWithMcpSca(
        client,
        async () => {
          throw new QontoScaRequiredError("tok-text-nopoll");
        },
        formatStringSuccess,
        { wait: false },
      );

      expect(getText(result)).toContain("No inline poll was requested");
    });

    it("denied response does not expose the session token", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "deny" } }));

      const result = await executeWithMcpSca(
        client,
        async () => {
          throw new QontoScaRequiredError("tok-deny-no-leak");
        },
        formatStringSuccess,
        { wait: 10, poll: { sleep: noopSleep } },
      );

      expect(getText(result)).not.toContain("tok-deny-no-leak");
    });
  });

  describe("idempotency key", () => {
    it("forwards a stable idempotency key across both attempts in the polling path", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
      const seenKeys: string[] = [];
      let called = false;

      await executeWithMcpSca(
        client,
        async ({ idempotencyKey }) => {
          seenKeys.push(idempotencyKey);
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-idem-stable");
          }
          return "ok";
        },
        formatStringSuccess,
        { wait: 10, poll: { sleep: noopSleep } },
      );

      expect(seenKeys).toHaveLength(2);
      expect(seenKeys[0]).toBe(seenKeys[1]);
    });

    it("forwards a supplied idempotency key in the polling path", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
      const seenKeys: string[] = [];
      let called = false;

      await executeWithMcpSca(
        client,
        async ({ idempotencyKey }) => {
          seenKeys.push(idempotencyKey);
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-idem-supplied");
          }
          return "ok";
        },
        formatStringSuccess,
        { wait: 10, poll: { sleep: noopSleep }, idempotencyKey: "mcp-supplied-key" },
      );

      expect(seenKeys).toEqual(["mcp-supplied-key", "mcp-supplied-key"]);
    });

    it("forwards a supplied idempotency key in the wait=0 path", async () => {
      const seenKeys: string[] = [];

      await executeWithMcpSca(
        client,
        async ({ idempotencyKey }) => {
          seenKeys.push(idempotencyKey);
          return "ok";
        },
        formatStringSuccess,
        { wait: 0, idempotencyKey: "mcp-wait0-key" },
      );

      expect(seenKeys).toEqual(["mcp-wait0-key"]);
    });

    it("forwards a supplied idempotency key in the scaSessionToken path", async () => {
      const seenKeys: string[] = [];

      await executeWithMcpSca(
        client,
        async ({ idempotencyKey }) => {
          seenKeys.push(idempotencyKey);
          return "ok";
        },
        formatStringSuccess,
        { scaSessionToken: "tok-supplied-with-key", idempotencyKey: "mcp-token-key" },
      );

      expect(seenKeys).toEqual(["mcp-token-key"]);
    });

    it("generates an idempotency key when none supplied (wait=0 path)", async () => {
      const seenKeys: string[] = [];

      await executeWithMcpSca(
        client,
        async ({ idempotencyKey }) => {
          seenKeys.push(idempotencyKey);
          return "ok";
        },
        formatStringSuccess,
        { wait: 0 },
      );

      expect(seenKeys).toHaveLength(1);
      // UUID v4 shape
      const key = seenKeys[0];
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe("defaults", () => {
    it("defaults wait to 30 (uses polling path)", async () => {
      // We verify the default by observing that a fresh QontoScaRequiredError
      // engages the polling layer (fetchSpy is called for the SCA session
      // poll). With wait=undefined the wrapper uses 30s.
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
      let called = false;

      await executeWithMcpSca(
        client,
        async () => {
          if (!called) {
            called = true;
            throw new QontoScaRequiredError("tok-default-wait");
          }
          return "ok";
        },
        formatStringSuccess,
        // No wait specified — should default to 30 (polling engaged).
        { poll: { sleep: noopSleep } },
      );

      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
