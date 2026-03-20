// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { buildTransactionQueryParams, getTransaction } from "./service.js";
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
