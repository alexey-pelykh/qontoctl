// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { getBulkTransfer } from "./service.js";

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
    fetchSpy.mockReturnValue(jsonResponse({ bulk_transfer: { id: "a/b" } }));

    await getBulkTransfer(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/bulk_transfers/a%2Fb");
  });
});
