// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { getScaSession, mockScaDecision, pollScaSession } from "./sca-service.js";
import { ScaDeniedError, ScaTimeoutError } from "./errors.js";

class TestableHttpClient extends HttpClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected override sleep(_ms: number): Promise<void> {
    return Promise.resolve();
  }
}

describe("SCA service", () => {
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

  describe("getScaSession", () => {
    it("sends GET to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "waiting" } }));

      await getScaSession(client, "tok-123");

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/sca/sessions/tok-123");
      expect(init.method).toBe("GET");
    });

    it("encodes the token in the URL", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "waiting" } }));

      await getScaSession(client, "tok/special&chars");

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/sca/sessions/tok%2Fspecial%26chars");
    });

    it("returns session with token and status", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

      const session = await getScaSession(client, "tok-456");

      expect(session).toEqual({ token: "tok-456", status: "allow" });
    });

    it("returns waiting status", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "waiting" } }));

      const session = await getScaSession(client, "tok-789");

      expect(session.status).toBe("waiting");
    });

    it("returns deny status", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "deny" } }));

      const session = await getScaSession(client, "tok-abc");

      expect(session.status).toBe("deny");
    });
  });

  describe("mockScaDecision", () => {
    it("sends POST to the /allow path with no body for an allow decision", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}, { status: 200 }));

      await mockScaDecision(client, "tok-mock", "allow");

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/mocked_sca_sessions/tok-mock/allow");
      expect(init.method).toBe("POST");
      expect(init.body).toBeUndefined();
    });

    it("sends POST to the /deny path with no body for a deny decision", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}, { status: 200 }));

      await mockScaDecision(client, "tok-mock", "deny");

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/mocked_sca_sessions/tok-mock/deny");
      expect(init.method).toBe("POST");
      expect(init.body).toBeUndefined();
    });

    it("does not set Content-Type when no body is sent", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}, { status: 200 }));

      await mockScaDecision(client, "tok-mock", "allow");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBeUndefined();
    });

    it("encodes the token in the URL but preserves the literal /allow suffix", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}, { status: 200 }));

      await mockScaDecision(client, "tok/special", "allow");

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/mocked_sca_sessions/tok%2Fspecial/allow");
    });

    it("encodes the token in the URL but preserves the literal /deny suffix", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}, { status: 200 }));

      await mockScaDecision(client, "tok/special", "deny");

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/mocked_sca_sessions/tok%2Fspecial/deny");
    });
  });

  describe("pollScaSession", () => {
    const noopSleep = () => Promise.resolve();

    it("returns immediately when session is allowed on first poll", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

      const session = await pollScaSession(client, "tok-1", { sleep: noopSleep });

      expect(session).toEqual({ token: "tok-1", status: "allow" });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("polls until session is allowed", async () => {
      fetchSpy
        .mockReturnValueOnce(jsonResponse({ sca_session: { status: "waiting" } }))
        .mockReturnValueOnce(jsonResponse({ sca_session: { status: "waiting" } }))
        .mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

      const session = await pollScaSession(client, "tok-2", { sleep: noopSleep });

      expect(session.status).toBe("allow");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("throws ScaDeniedError when session is denied", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "deny" } }));

      const error = await pollScaSession(client, "tok-3", { sleep: noopSleep }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ScaDeniedError);
      expect((error as ScaDeniedError).scaSessionToken).toBe("tok-3");
      expect(error.message).not.toContain("tok-3");
    });

    it("throws ScaTimeoutError when timeout is exceeded", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "waiting" } }));

      const error = await pollScaSession(client, "tok-4", {
        timeoutMs: 0,
        sleep: noopSleep,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ScaTimeoutError);
      expect((error as ScaTimeoutError).scaSessionToken).toBe("tok-4");
      expect((error as ScaTimeoutError).timeoutMs).toBe(0);
      expect(error.message).not.toContain("tok-4");
    });

    it("calls onPoll callback with attempt number and elapsed time", async () => {
      fetchSpy
        .mockReturnValueOnce(jsonResponse({ sca_session: { status: "waiting" } }))
        .mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

      const onPoll = vi.fn();

      await pollScaSession(client, "tok-5", { sleep: noopSleep, onPoll });

      expect(onPoll).toHaveBeenCalledTimes(2);
      expect(onPoll.mock.calls[0]?.[0]).toBe(1);
      expect(onPoll.mock.calls[1]?.[0]).toBe(2);
      // Elapsed should be a number
      expect(typeof onPoll.mock.calls[0]?.[1]).toBe("number");
    });

    it("uses custom interval for sleep between polls", async () => {
      const sleepCalls: number[] = [];
      fetchSpy
        .mockReturnValueOnce(jsonResponse({ sca_session: { status: "waiting" } }))
        .mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

      await pollScaSession(client, "tok-6", {
        intervalMs: 5000,
        sleep: (ms) => {
          sleepCalls.push(ms);
          return Promise.resolve();
        },
      });

      expect(sleepCalls).toEqual([5000]);
    });

    it("uses default sleep when none provided", async () => {
      vi.useFakeTimers();
      try {
        fetchSpy
          .mockReturnValueOnce(jsonResponse({ sca_session: { status: "waiting" } }))
          .mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

        const promise = pollScaSession(client, "tok-default", { intervalMs: 100 });
        await vi.advanceTimersByTimeAsync(200);
        const session = await promise;
        expect(session.status).toBe("allow");
      } finally {
        vi.useRealTimers();
      }
    });

    it("throws ScaDeniedError after polling when deny comes", async () => {
      fetchSpy
        .mockReturnValueOnce(jsonResponse({ sca_session: { status: "waiting" } }))
        .mockReturnValue(jsonResponse({ sca_session: { status: "deny" } }));

      const error = await pollScaSession(client, "tok-7", { sleep: noopSleep }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ScaDeniedError);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
