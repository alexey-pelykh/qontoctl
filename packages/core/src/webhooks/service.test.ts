// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { listWebhooks, getWebhook, createWebhook, updateWebhook, deleteWebhook } from "./service.js";

// Empirically observed (2026-05-10): the Qonto API returns single webhook
// objects directly (no `webhook_subscription` envelope) and lists them under
// `subscriptions`. The `description` field is omitted. Mocks here mirror that
// shape; #452 added the real-API E2E that drove these tests away from their
// prior aspirational fixtures.

describe("listWebhooks", () => {
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

  it("lists webhook subscriptions without params", async () => {
    const body = {
      subscriptions: [
        {
          id: "wh-1",
          organization_id: "org-1",
          membership_id: "mem-1",
          callback_url: "https://example.com/hook",
          types: ["v1/transactions"],
          secret: "whsec_abc",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listWebhooks(client);
    expect(result.subscriptions).toHaveLength(1);
    expect(result.meta.current_page).toBe(1);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/webhook_subscriptions");
    expect(url.search).toBe("");
  });

  it("passes pagination params as query strings", async () => {
    const body = {
      subscriptions: [],
      meta: { current_page: 2, next_page: null, prev_page: 1, total_pages: 2, total_count: 30, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listWebhooks(client, { page: 2, per_page: 25 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("25");
  });

  it("omits undefined pagination params", async () => {
    const body = {
      subscriptions: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listWebhooks(client, { page: 3 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.has("per_page")).toBe(false);
  });
});

describe("getWebhook", () => {
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

  it("fetches a webhook subscription by ID (response object is unwrapped)", async () => {
    const webhook = {
      id: "wh-1",
      organization_id: "org-1",
      membership_id: "mem-1",
      callback_url: "https://example.com/hook",
      types: ["v1/transactions"],
      secret: "whsec_abc",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse(webhook));

    const result = await getWebhook(client, "wh-1");
    expect(result).toEqual(webhook);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/webhook_subscriptions/wh-1");
  });

  it("encodes special characters in the ID", async () => {
    const webhook = {
      id: "a/b",
      organization_id: "org-1",
      membership_id: "mem-1",
      callback_url: "https://example.com/hook",
      types: ["v1/transactions"],
      secret: "whsec_abc",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse(webhook));

    await getWebhook(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/webhook_subscriptions/a%2Fb");
  });
});

describe("createWebhook", () => {
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

  it("posts to the correct endpoint and returns the created webhook (unwrapped)", async () => {
    const webhook = {
      id: "wh-new",
      organization_id: "org-1",
      membership_id: "mem-1",
      callback_url: "https://example.com/hook",
      types: ["v1/transactions", "v1/cards"],
      secret: "whsec_abc",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse(webhook));

    const result = await createWebhook(client, {
      callback_url: "https://example.com/hook",
      types: ["v1/transactions", "v1/cards"],
    });
    expect(result).toEqual(webhook);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/webhook_subscriptions");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      callback_url: "https://example.com/hook",
      types: ["v1/transactions", "v1/cards"],
    });
  });
});

describe("updateWebhook", () => {
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

  it("puts to the correct endpoint and returns the updated webhook (unwrapped)", async () => {
    const webhook = {
      id: "wh-1",
      organization_id: "org-1",
      membership_id: "mem-1",
      callback_url: "https://example.com/new-hook",
      types: ["v1/transactions"],
      secret: "whsec_abc",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse(webhook));

    const result = await updateWebhook(client, "wh-1", {
      callback_url: "https://example.com/new-hook",
    });
    expect(result).toEqual(webhook);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/webhook_subscriptions/wh-1");
    expect(init.method).toBe("PUT");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ callback_url: "https://example.com/new-hook" });
  });

  it("encodes special characters in the ID", async () => {
    const webhook = {
      id: "a/b",
      organization_id: "org-1",
      membership_id: "mem-1",
      callback_url: "https://example.com/hook",
      types: ["v1/transactions"],
      secret: "whsec_abc",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse(webhook));

    await updateWebhook(client, "a/b", { callback_url: "https://example.com" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/webhook_subscriptions/a%2Fb");
  });
});

describe("deleteWebhook", () => {
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

  it("deletes to the correct endpoint", async () => {
    fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

    await deleteWebhook(client, "wh-1");

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/webhook_subscriptions/wh-1");
    expect(init.method).toBe("DELETE");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

    await deleteWebhook(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/webhook_subscriptions/a%2Fb");
  });
});
