// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { buildTransactionQueryParams, getTransaction } from "./service.js";
import type { ListTransactionsParams } from "./types.js";

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
    const txn = { id: "txn-1", label: "Coffee Shop", amount: 4.5 };
    fetchSpy.mockReturnValue(jsonResponse({ transaction: txn }));

    const result = await getTransaction(client, "txn-1");
    expect(result).toEqual(txn);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/transactions/txn-1");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transaction: { id: "a/b" } }));

    await getTransaction(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/transactions/a%2Fb");
  });

  it("passes includes as query params", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transaction: { id: "txn-1" } }));

    await getTransaction(client, "txn-1", ["labels", "attachments"]);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("includes[]")).toEqual(["labels", "attachments"]);
  });

  it("omits includes param when not provided", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transaction: { id: "txn-1" } }));

    await getTransaction(client, "txn-1");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.has("includes[]")).toBe(false);
  });
});
