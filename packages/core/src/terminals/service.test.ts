// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { createTerminalPayment, listTerminals } from "./service.js";

describe("listTerminals", () => {
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

  it("lists terminals without params", async () => {
    const body = {
      terminals: [
        {
          id: "term-1",
          poi_id: "POI-001",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 100 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listTerminals(client);
    expect(result.terminals).toHaveLength(1);
    expect(result.terminals[0]?.id).toBe("term-1");
    expect(result.terminals[0]?.poi_id).toBe("POI-001");
    expect(result.meta.current_page).toBe(1);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/terminals");
    expect(url.search).toBe("");
    expect(init.method).toBe("GET");
  });

  it("passes pagination params as query strings", async () => {
    const body = {
      terminals: [],
      meta: { current_page: 2, next_page: null, prev_page: 1, total_pages: 2, total_count: 30, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listTerminals(client, { page: 2, per_page: 25 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("25");
  });

  it("omits undefined pagination params", async () => {
    const body = {
      terminals: [],
      meta: { current_page: 3, next_page: null, prev_page: 2, total_pages: 3, total_count: 0, per_page: 100 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listTerminals(client, { page: 3 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.has("per_page")).toBe(false);
  });

  it("returns an empty list when the organization has no terminals", async () => {
    const body = {
      terminals: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 100 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listTerminals(client);
    expect(result.terminals).toHaveLength(0);
    expect(result.meta.total_count).toBe(0);
  });
});

describe("createTerminalPayment", () => {
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

  it("posts to /v2/terminals/{id}/payment and returns the unwrapped payment", async () => {
    const payment = {
      id: "pay-1",
      terminal_id: "term-1",
      amount: { value: "12.50", currency: "EUR" },
      created_at: "2026-01-01T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ terminal_payment: payment }, { status: 202 }));

    const result = await createTerminalPayment(client, "term-1", {
      amount: { value: "12.50", currency: "EUR" },
    });

    expect(result.id).toBe("pay-1");
    expect(result.amount.value).toBe("12.50");
    expect(result.amount.currency).toBe("EUR");

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/terminals/term-1/payment");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ amount: { value: "12.50", currency: "EUR" } });
  });

  it("forwards metadata through to the API and back from the response", async () => {
    const payment = {
      id: "pay-2",
      terminal_id: "term-1",
      amount: { value: "99.00", currency: "EUR" },
      metadata: { order_id: "ord-42", table: 7 },
      created_at: "2026-01-01T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ terminal_payment: payment }, { status: 202 }));

    const result = await createTerminalPayment(client, "term-1", {
      amount: { value: "99.00", currency: "EUR" },
      metadata: { order_id: "ord-42", table: 7 },
    });

    expect(result.metadata).toEqual({ order_id: "ord-42", table: 7 });

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(init.body as string) as { metadata?: Record<string, unknown> };
    expect(body.metadata).toEqual({ order_id: "ord-42", table: 7 });
  });

  it("auto-generates an idempotency key when none is supplied", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse(
        {
          terminal_payment: {
            id: "pay-3",
            terminal_id: "term-1",
            amount: { value: "1.00", currency: "EUR" },
            created_at: "2026-01-01T00:00:00Z",
          },
        },
        { status: 202 },
      ),
    );

    await createTerminalPayment(client, "term-1", { amount: { value: "1.00", currency: "EUR" } });

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Qonto-Idempotency-Key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("forwards a caller-supplied idempotency key verbatim", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse(
        {
          terminal_payment: {
            id: "pay-4",
            terminal_id: "term-1",
            amount: { value: "1.00", currency: "EUR" },
            created_at: "2026-01-01T00:00:00Z",
          },
        },
        { status: 202 },
      ),
    );

    await createTerminalPayment(
      client,
      "term-1",
      { amount: { value: "1.00", currency: "EUR" } },
      { idempotencyKey: "fixed-key-123" },
    );

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Qonto-Idempotency-Key"]).toBe("fixed-key-123");
  });

  it("URL-encodes the terminal ID", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse(
        {
          terminal_payment: {
            id: "pay-5",
            terminal_id: "a/b",
            amount: { value: "1.00", currency: "EUR" },
            created_at: "2026-01-01T00:00:00Z",
          },
        },
        { status: 202 },
      ),
    );

    await createTerminalPayment(client, "a/b", { amount: { value: "1.00", currency: "EUR" } });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/terminals/a%2Fb/payment");
  });
});
