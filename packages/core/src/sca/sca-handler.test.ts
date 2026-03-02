// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient, QontoScaRequiredError } from "../http-client.js";
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

  it("handles SCA flow: catches 428, polls, retries", async () => {
    let callCount = 0;

    // SCA poll returns allow immediately
    fetchSpy.mockReturnValue(jsonResponse({ sca_session: { status: "allow" } }));

    const result = await executeWithSca(
      client,
      async (scaToken) => {
        callCount++;
        if (callCount === 1) {
          throw new QontoScaRequiredError("tok-sca-1");
        }
        return `retried-with-${scaToken ?? "none"}`;
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
});
