// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  cancelRecurringTransfer,
  createRecurringTransfer,
  getRecurringTransfer,
  listRecurringTransfers,
} from "./service.js";

const sampleRecurringTransfer = {
  id: "rt-new",
  initiator_id: "user-1",
  bank_account_id: "acc-1",
  amount: 100,
  amount_cents: 10000,
  amount_currency: "EUR",
  beneficiary_id: "ben-1",
  reference: "Monthly rent",
  note: "Rent payment",
  first_execution_date: "2026-01-01",
  last_execution_date: null,
  next_execution_date: "2026-02-01",
  frequency: "monthly",
  status: "active",
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

describe("createRecurringTransfer", () => {
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

  it("posts to the correct endpoint and returns recurring transfer", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ recurring_transfer: sampleRecurringTransfer }));

    const result = await createRecurringTransfer(client, {
      beneficiary_id: "ben-1",
      bank_account_id: "acc-1",
      amount: 100,
      currency: "EUR",
      reference: "Monthly rent",
      note: "Rent payment",
      first_execution_date: "2026-01-01",
      frequency: "monthly",
    });
    expect(result).toEqual(sampleRecurringTransfer);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      recurring_transfer: {
        beneficiary_id: "ben-1",
        bank_account_id: "acc-1",
        amount: 100,
        currency: "EUR",
        reference: "Monthly rent",
        note: "Rent payment",
        first_execution_date: "2026-01-01",
        frequency: "monthly",
      },
    });
  });

  it("sends idempotency key header when provided", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ recurring_transfer: sampleRecurringTransfer }));

    await createRecurringTransfer(
      client,
      {
        beneficiary_id: "ben-1",
        bank_account_id: "acc-1",
        amount: 100,
        currency: "EUR",
        reference: "Monthly rent",
        first_execution_date: "2026-01-01",
        frequency: "monthly",
      },
      { idempotencyKey: "idem-456" },
    );

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Qonto-Idempotency-Key"]).toBe("idem-456");
  });
});

describe("cancelRecurringTransfer", () => {
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

  it("posts to the cancel endpoint", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await cancelRecurringTransfer(client, "rt-1");

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers/rt-1/cancel");
    expect(init.method).toBe("POST");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await cancelRecurringTransfer(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers/a%2Fb/cancel");
  });
});

describe("getRecurringTransfer", () => {
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

  it("fetches a recurring transfer by ID", async () => {
    const recurringTransfer = {
      id: "rt-1",
      initiator_id: "user-1",
      bank_account_id: "acc-1",
      amount: 100.5,
      amount_cents: 10050,
      amount_currency: "EUR",
      beneficiary_id: "ben-1",
      reference: "Monthly rent",
      note: "Rent payment",
      first_execution_date: "2026-01-01",
      last_execution_date: null,
      next_execution_date: "2026-02-01",
      frequency: "monthly",
      status: "active",
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ recurring_transfer: recurringTransfer }));

    const result = await getRecurringTransfer(client, "rt-1");
    expect(result).toEqual(recurringTransfer);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers/rt-1");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        recurring_transfer: {
          id: "a/b",
          initiator_id: "user-1",
          bank_account_id: "acc-1",
          amount: 100,
          amount_cents: 10000,
          amount_currency: "EUR",
          beneficiary_id: "ben-1",
          reference: "ref",
          note: "",
          first_execution_date: "2026-01-01",
          last_execution_date: null,
          next_execution_date: "2026-02-01",
          frequency: "monthly",
          status: "active",
          created_at: "2026-01-01T10:00:00Z",
          updated_at: "2026-01-01T10:00:00Z",
        },
      }),
    );

    await getRecurringTransfer(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers/a%2Fb");
  });
});

describe("listRecurringTransfers", () => {
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

  it("lists recurring transfers without params", async () => {
    const body = {
      recurring_transfers: [
        {
          id: "rt-1",
          initiator_id: "user-1",
          bank_account_id: "acc-1",
          amount: 100,
          amount_cents: 10000,
          amount_currency: "EUR",
          beneficiary_id: "ben-1",
          reference: "Rent",
          note: "",
          first_execution_date: "2026-01-01",
          last_execution_date: null,
          next_execution_date: "2026-02-01",
          frequency: "monthly",
          status: "active",
          created_at: "2026-01-01T10:00:00Z",
          updated_at: "2026-01-01T10:00:00Z",
        },
      ],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listRecurringTransfers(client);
    expect(result.recurring_transfers).toHaveLength(1);
    expect(result.meta.current_page).toBe(1);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers");
    expect(url.search).toBe("");
  });

  it("passes pagination params as query strings", async () => {
    const body = {
      recurring_transfers: [],
      meta: { current_page: 2, next_page: null, prev_page: 1, total_pages: 2, total_count: 30, per_page: 10 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listRecurringTransfers(client, { page: 2, per_page: 10 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  it("omits undefined pagination params", async () => {
    const body = {
      recurring_transfers: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listRecurringTransfers(client, { per_page: 5 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.get("per_page")).toBe("5");
  });
});
