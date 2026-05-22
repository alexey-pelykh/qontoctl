// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { HttpClient } from "../http-client.js";
import { sendQuote } from "./service.js";

describe("sendQuote", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("issues POST /v2/quotes/{id}/send with the JSON-serialised payload and Content-Type application/json", async () => {
    fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

    const payload = {
      send_to: ["a@example.com", "b@example.com"],
      copy_to_self: true,
      email_title: "Your quote",
      email_body: "Please find the attached quote.",
    };
    await sendQuote(client, "quote-1", payload);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/quotes/quote-1/send");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual(payload);
    const headers = new Headers(opts.headers as HeadersInit);
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

    await sendQuote(client, "a/b", {
      send_to: ["a@example.com"],
      copy_to_self: true,
      email_title: "X",
    });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/quotes/a%2Fb/send");
  });
});
