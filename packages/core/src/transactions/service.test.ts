// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { buildTransactionQueryParams, getTransaction, listTransactions } from "./service.js";
import type { ListTransactionsParams } from "./types.js";

const validTransaction = {
  id: "txn-1",
  transaction_id: "tid-1",
  amount: 4.5,
  amount_cents: 450,
  settled_balance: 1000.0,
  settled_balance_cents: 100000,
  local_amount: 4.5,
  local_amount_cents: 450,
  side: "debit",
  operation_type: "card",
  currency: "EUR",
  local_currency: "EUR",
  label: "Coffee Shop",
  clean_counterparty_name: "Coffee Shop Inc",
  settled_at: "2026-01-15T10:00:00Z",
  emitted_at: "2026-01-15T09:00:00Z",
  created_at: "2026-01-15T09:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
  status: "completed",
  note: null,
  reference: null,
  vat_amount: null,
  vat_amount_cents: null,
  vat_rate: null,
  initiator_id: "user-1",
  label_ids: [],
  attachment_ids: [],
  attachment_lost: false,
  attachment_required: false,
  card_last_digits: "1234",
  category: "meals_and_entertainment",
  subject_type: "Card",
  bank_account_id: "acc-1",
  is_external_transaction: false,
};

describe("buildTransactionQueryParams", () => {
  it("returns empty object for empty params", () => {
    const result = buildTransactionQueryParams({});
    expect(result).toEqual({});
  });

  it("maps scalar string params", () => {
    const params: ListTransactionsParams = {
      bank_account_id: "acc-123",
      side: "debit",
      settled_at_from: "2025-01-01T00:00:00Z",
      settled_at_to: "2025-01-31T23:59:59Z",
      sort_by: "settled_at:desc",
    };
    const result = buildTransactionQueryParams(params);
    expect(result).toEqual({
      bank_account_id: "acc-123",
      side: "debit",
      settled_at_from: "2025-01-01T00:00:00Z",
      settled_at_to: "2025-01-31T23:59:59Z",
      sort_by: "settled_at:desc",
    });
  });

  it("maps array params with [] suffix", () => {
    const params: ListTransactionsParams = {
      status: ["pending", "completed"],
      operation_type: ["card", "transfer"],
      includes: ["labels", "attachments"],
    };
    const result = buildTransactionQueryParams(params);
    expect(result).toEqual({
      "status[]": ["pending", "completed"],
      "operation_type[]": ["card", "transfer"],
      "includes[]": ["labels", "attachments"],
    });
  });

  it("maps boolean with_attachments to string", () => {
    const result = buildTransactionQueryParams({ with_attachments: true });
    expect(result).toEqual({ with_attachments: "true" });
  });

  it("omits empty arrays", () => {
    const result = buildTransactionQueryParams({
      status: [],
      operation_type: [],
      includes: [],
    });
    expect(result).toEqual({});
  });
});

describe("getTransaction", () => {
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

  it("fetches a transaction by ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transaction: validTransaction }));

    const result = await getTransaction(client, "txn-1");
    expect(result).toEqual(validTransaction);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/transactions/txn-1");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transaction: { ...validTransaction, id: "a/b" } }));

    await getTransaction(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/transactions/a%2Fb");
  });

  it("passes includes as query params", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transaction: validTransaction }));

    await getTransaction(client, "txn-1", ["labels", "attachments"]);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("includes[]")).toEqual(["labels", "attachments"]);
  });

  it("omits includes param when not provided", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transaction: validTransaction }));

    await getTransaction(client, "txn-1");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.has("includes[]")).toBe(false);
  });
});

describe("listTransactions", () => {
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

  it("lists transactions without params", async () => {
    const body = {
      transactions: [validTransaction],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listTransactions(client);
    expect(result.transactions).toHaveLength(1);
    expect(result.meta.current_page).toBe(1);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/transactions");
    expect(url.search).toBe("");
  });

  it("passes filter and pagination params as query strings", async () => {
    const body = {
      transactions: [],
      meta: { current_page: 2, next_page: null, prev_page: 1, total_pages: 2, total_count: 30, per_page: 10 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listTransactions(client, {
      bank_account_id: "acc-1",
      status: ["completed"],
      current_page: 2,
      per_page: 10,
    });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("bank_account_id")).toBe("acc-1");
    expect(url.searchParams.getAll("status[]")).toEqual(["completed"]);
    expect(url.searchParams.get("current_page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  it("omits undefined pagination params", async () => {
    const body = {
      transactions: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listTransactions(client, { current_page: 3 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("current_page")).toBe("3");
    expect(url.searchParams.has("per_page")).toBe(false);
  });
});
