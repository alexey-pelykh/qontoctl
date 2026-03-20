// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { getBulkTransfer, listBulkTransfers } from "./service.js";

describe("getBulkTransfer", () => {
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

  it("fetches a bulk transfer by ID", async () => {
    const bulkTransfer = {
      id: "bt-1",
      initiator_id: "user-1",
      created_at: "2026-01-15T10:00:00Z",
      updated_at: "2026-01-15T10:05:00Z",
      total_count: 5,
      completed_count: 3,
      pending_count: 1,
      failed_count: 1,
      results: [],
    };
    fetchSpy.mockReturnValue(jsonResponse({ bulk_transfer: bulkTransfer }));

    const result = await getBulkTransfer(client, "bt-1");
    expect(result).toEqual(bulkTransfer);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/bulk_transfers/bt-1");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        bulk_transfer: {
          id: "a/b",
          initiator_id: "user-1",
          created_at: "2026-01-15T10:00:00Z",
          updated_at: "2026-01-15T10:05:00Z",
          total_count: 0,
          completed_count: 0,
          pending_count: 0,
          failed_count: 0,
          results: [],
        },
      }),
    );

    await getBulkTransfer(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/bulk_transfers/a%2Fb");
  });
});

describe("listBulkTransfers", () => {
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

  it("lists bulk transfers without params", async () => {
    const body = {
      bulk_transfers: [
        {
          id: "bt-1",
          initiator_id: "user-1",
          created_at: "2026-01-15T10:00:00Z",
          updated_at: "2026-01-15T10:05:00Z",
          total_count: 5,
          completed_count: 3,
          pending_count: 1,
          failed_count: 1,
          results: [],
        },
      ],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listBulkTransfers(client);
    expect(result.bulk_transfers).toHaveLength(1);
    expect(result.meta.current_page).toBe(1);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/bulk_transfers");
    expect(url.search).toBe("");
  });

  it("passes pagination params as query strings", async () => {
    const body = {
      bulk_transfers: [],
      meta: { current_page: 2, next_page: null, prev_page: 1, total_pages: 2, total_count: 30, per_page: 10 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listBulkTransfers(client, { current_page: 2, per_page: 10 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("current_page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  it("omits undefined pagination params", async () => {
    const body = {
      bulk_transfers: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listBulkTransfers(client, { per_page: 5 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.has("current_page")).toBe(false);
    expect(url.searchParams.get("per_page")).toBe("5");
  });
});
