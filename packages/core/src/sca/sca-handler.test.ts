// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient, QontoScaNotEnrolledError, QontoScaRequiredError } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { executeWithSca } from "./sca-handler.js";

class TestableHttpClient extends HttpClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected override sleep(_ms: number): Promise<void> {
    return Promise.resolve();
  }
}

describe("executeWithSca", () => {
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
    const result = await executeWithSca(client, async () => "success");

    expect(result).toBe("success");
  });

  it("propagates non-SCA errors", async () => {
    const error = new Error("network failure");

    const caught = await executeWithSca(client, async () => {
      throw error;
    }).catch((e: unknown) => e);

    expect(caught).toBe(error);
  });

  it("propagates QontoScaNotEnrolledError without polling", async () => {
    // Configuration error: caller must enroll SCA on the Qonto account.
    // executeWithSca must NOT attempt to poll a non-existent SCA session.
    const error = new QontoScaNotEnrolledError([
      { code: "sca_not_enrolled", detail: "You must enable SCA to perform this action" },
    ]);
    const onScaRequired = vi.fn();

    const caught = await executeWithSca(
      client,
      async () => {
        throw error;
      },
      { onScaRequired, poll: { sleep: noopSleep } },
    ).catch((e: unknown) => e);

    expect(caught).toBe(error);
    expect(caught).toBeInstanceOf(QontoScaNotEnrolledError);
    expect(onScaRequired).not.toHaveBeenCalled();
    // No polling should have occurred (no fetch calls for SCA session).
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles SCA flow: catches 428, polls, retries", async () => {
    let callCount = 0;

    // SCA poll returns allow immediately
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

    const result = await executeWithSca(
      client,
      async ({ scaSessionToken }) => {
        callCount++;
        if (callCount === 1) {
          throw new QontoScaRequiredError("tok-sca-1");
        }
        return `retried-with-${scaSessionToken ?? "none"}`;
      },
      { poll: { sleep: noopSleep } },
    );

    expect(result).toBe("retried-with-tok-sca-1");
    expect(callCount).toBe(2);
  });

  it("calls onScaRequired callback with token", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    const onScaRequired = vi.fn();
    let called = false;

    await executeWithSca(
      client,
      async () => {
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-cb-1");
        }
        return "ok";
      },
      { onScaRequired, poll: { sleep: noopSleep } },
    );

    expect(onScaRequired).toHaveBeenCalledWith("tok-cb-1");
  });

  it("calls onPoll callback during polling", async () => {
    fetchSpy
      .mockReturnValueOnce(jsonResponse({ sca_session: { status: "waiting" } }))
      .mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

    const onPoll = vi.fn();
    let called = false;

    await executeWithSca(
      client,
      async () => {
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-poll-1");
        }
        return "ok";
      },
      { onPoll, poll: { sleep: noopSleep } },
    );

    expect(onPoll).toHaveBeenCalled();
    expect(onPoll.mock.calls[0]?.[0]).toBe(1);
  });

  it("propagates QontoScaRequiredError if retry also triggers 428", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

    const error = await executeWithSca(
      client,
      async () => {
        throw new QontoScaRequiredError("tok-always-428");
      },
      { poll: { sleep: noopSleep } },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QontoScaRequiredError);
    expect((error as QontoScaRequiredError).scaSessionToken).toBe("tok-always-428");
  });

  it("calls onScaApproved callback before retry", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    const onScaApproved = vi.fn();
    const callOrder: string[] = [];
    let called = false;

    onScaApproved.mockImplementation(() => {
      callOrder.push("approved");
    });

    await executeWithSca(
      client,
      async () => {
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-approved-1");
        }
        callOrder.push("retry");
        return "ok";
      },
      { onScaApproved, poll: { sleep: noopSleep } },
    );

    expect(callOrder).toEqual(["approved", "retry"]);
  });

  it("threads the same idempotency key to both attempts when none is supplied", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    const seenKeys: string[] = [];
    let called = false;

    await executeWithSca(
      client,
      async ({ idempotencyKey }) => {
        seenKeys.push(idempotencyKey);
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-idem-auto");
        }
        return "ok";
      },
      { poll: { sleep: noopSleep } },
    );

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).toBe(seenKeys[1]);
    expect(seenKeys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("uses the supplied idempotency key on both attempts", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));
    const seenKeys: string[] = [];
    let called = false;

    await executeWithSca(
      client,
      async ({ idempotencyKey }) => {
        seenKeys.push(idempotencyKey);
        if (!called) {
          called = true;
          throw new QontoScaRequiredError("tok-idem-supplied");
        }
        return "ok";
      },
      { idempotencyKey: "user-supplied-key", poll: { sleep: noopSleep } },
    );

    expect(seenKeys).toEqual(["user-supplied-key", "user-supplied-key"]);
  });

  it("emits matching X-Qonto-Idempotency-Key header on both wire requests across SCA retry", async () => {
    // First call: 428 SCA Required from the API.
    // Then: poll returns allow.
    // Retry: 200 OK.
    fetchSpy
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ sca_session_token: "tok-wire-1" }), {
            status: 428,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      .mockImplementationOnce(() => jsonResponse({ sca_session: { status: "allow" } }))
      .mockImplementationOnce(() => jsonResponse({ id: "tx-1" }));

    await executeWithSca(
      client,
      async ({ scaSessionToken, idempotencyKey }) =>
        client.post(
          "/v2/transfers",
          { amount: 100 },
          {
            idempotencyKey,
            ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
          },
        ),
      { poll: { sleep: noopSleep } },
    );

    // Three fetch calls: initial transfer (428), SCA poll, retry transfer.
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const initialHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const retryHeaders = fetchSpy.mock.calls[2]?.[1]?.headers as Record<string, string>;

    expect(initialHeaders["X-Qonto-Idempotency-Key"]).toBeDefined();
    expect(retryHeaders["X-Qonto-Idempotency-Key"]).toBe(initialHeaders["X-Qonto-Idempotency-Key"]);
    expect(retryHeaders["X-Qonto-Sca-Session-Token"]).toBe("tok-wire-1");
  });

  it("emits supplied X-Qonto-Idempotency-Key header on both wire requests across SCA retry", async () => {
    fetchSpy
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ sca_session_token: "tok-wire-2" }), {
            status: 428,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      .mockImplementationOnce(() => jsonResponse({ sca_session: { status: "allow" } }))
      .mockImplementationOnce(() => jsonResponse({ id: "tx-2" }));

    await executeWithSca(
      client,
      async ({ scaSessionToken, idempotencyKey }) =>
        client.post(
          "/v2/transfers",
          { amount: 200 },
          {
            idempotencyKey,
            ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
          },
        ),
      { idempotencyKey: "supplied-stable-key", poll: { sleep: noopSleep } },
    );

    const initialHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const retryHeaders = fetchSpy.mock.calls[2]?.[1]?.headers as Record<string, string>;

    expect(initialHeaders["X-Qonto-Idempotency-Key"]).toBe("supplied-stable-key");
    expect(retryHeaders["X-Qonto-Idempotency-Key"]).toBe("supplied-stable-key");
  });

  it("fires autoApprove mock-decision POST before polling when autoApprove='allow'", async () => {
    // Sequence:
    //   1. Operation: 428 SCA Required (token "tok-auto-allow").
    //   2. autoApprove fires: POST /v2/mocked_sca_sessions/tok-auto-allow/allow
    //      (status 204; mock-decision API has no body).
    //   3. Poll: GET sca-session → status "allow".
    //   4. Operation retry: 200 OK with the SCA token attached.
    fetchSpy
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ sca_session_token: "tok-auto-allow" }), {
            status: 428,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })))
      .mockImplementationOnce(() => jsonResponse({ sca_session: { status: "allow" } }))
      .mockImplementationOnce(() => jsonResponse({ id: "tx-auto" }));

    await executeWithSca(
      client,
      async ({ scaSessionToken, idempotencyKey }) =>
        client.post(
          "/v2/transfers",
          { amount: 50 },
          {
            idempotencyKey,
            ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
          },
        ),
      { autoApprove: "allow", poll: { sleep: noopSleep } },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    // The second wire call MUST be the auto-approve POST — proving auto-approve
    // fires before polling. If polling fired first, fetch[1] would be the GET.
    const [autoApproveUrl, autoApproveInit] = fetchSpy.mock.calls[1] as [URL, RequestInit];
    expect(autoApproveUrl.pathname).toBe("/v2/mocked_sca_sessions/tok-auto-allow/allow");
    expect((autoApproveInit.method ?? "GET").toUpperCase()).toBe("POST");
    // And the third is the poll, fourth is the retry.
    const [pollUrl] = fetchSpy.mock.calls[2] as [URL, RequestInit];
    expect(pollUrl.pathname).toBe("/v2/sca/sessions/tok-auto-allow");
  });

  it("fires autoApprove mock-decision POST with 'deny' before polling, then propagates ScaDeniedError", async () => {
    // autoApprove="deny" still fires the mock-decision (because the caller
    // wants to exercise the deny path), and then polling observes "deny",
    // which propagates as ScaDeniedError to the caller. The wrapper must
    // NOT swallow the deny.
    fetchSpy
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ sca_session_token: "tok-auto-deny" }), {
            status: 428,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })))
      .mockImplementationOnce(() => jsonResponse({ sca_session: { status: "deny" } }));

    const caught = await executeWithSca(
      client,
      async ({ scaSessionToken, idempotencyKey }) =>
        client.post(
          "/v2/transfers",
          { amount: 50 },
          {
            idempotencyKey,
            ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
          },
        ),
      { autoApprove: "deny", poll: { sleep: noopSleep } },
    ).catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe("ScaDeniedError");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    // Verify the mock-decision call carried "/deny", not "/allow".
    const [autoApproveUrl] = fetchSpy.mock.calls[1] as [URL, RequestInit];
    expect(autoApproveUrl.pathname).toBe("/v2/mocked_sca_sessions/tok-auto-deny/deny");
  });

  it("skips autoApprove when undefined (existing flow unchanged)", async () => {
    // Regression guard: when autoApprove is not supplied, the handler must
    // poll without firing any mock-decision, so existing dual-process flows
    // and production paths continue to work.
    fetchSpy
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(JSON.stringify({ sca_session_token: "tok-no-auto" }), {
            status: 428,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      .mockImplementationOnce(() => jsonResponse({ sca_session: { status: "allow" } }))
      .mockImplementationOnce(() => jsonResponse({ id: "tx-no-auto" }));

    await executeWithSca(
      client,
      async ({ scaSessionToken, idempotencyKey }) =>
        client.post(
          "/v2/transfers",
          { amount: 50 },
          {
            idempotencyKey,
            ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
          },
        ),
      { poll: { sleep: noopSleep } },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    // Second call must be the poll, NOT a mock-decision POST.
    const [pollUrl] = fetchSpy.mock.calls[1] as [URL, RequestInit];
    expect(pollUrl.pathname).toBe("/v2/sca/sessions/tok-no-auto");
    // No mock-decision URL should appear anywhere.
    for (const call of fetchSpy.mock.calls) {
      const [url] = call as [URL, RequestInit];
      expect(url.pathname).not.toContain("/mocked_sca_sessions/");
    }
  });
});
