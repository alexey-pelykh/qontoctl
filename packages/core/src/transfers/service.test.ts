// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { buildTransferQueryParams, getTransfer } from "./service.js";
import type { ListTransfersParams } from "./types.js";

describe("buildTransferQueryParams", () => {
  it("returns empty object for empty params", () => {
    const result = buildTransferQueryParams({});
    expect(result).toEqual({});
  });

  it("maps status array with [] suffix", () => {
    const params: ListTransfersParams = {
      status: ["pending", "settled"],
    };
    const result = buildTransferQueryParams(params);
    expect(result).toEqual({
      "status[]": ["pending", "settled"],
    });
  });

  it("maps date range params", () => {
    const params: ListTransfersParams = {
      updated_at_from: "2025-01-01T00:00:00Z",
      updated_at_to: "2025-01-31T23:59:59Z",
      scheduled_date_from: "2025-01-01",
      scheduled_date_to: "2025-01-31",
    };
    const result = buildTransferQueryParams(params);
    expect(result).toEqual({
      updated_at_from: "2025-01-01T00:00:00Z",
      updated_at_to: "2025-01-31T23:59:59Z",
      scheduled_date_from: "2025-01-01",
      scheduled_date_to: "2025-01-31",
    });
  });

  it("maps array params with [] suffix", () => {
    const params: ListTransfersParams = {
      beneficiary_ids: ["ben-1", "ben-2"],
      ids: ["id-1"],
      recurring_transfer_ids: ["rec-1", "rec-2"],
    };
    const result = buildTransferQueryParams(params);
    expect(result).toEqual({
      "beneficiary_ids[]": ["ben-1", "ben-2"],
      "ids[]": ["id-1"],
      "recurring_transfer_ids[]": ["rec-1", "rec-2"],
    });
  });

  it("maps sort_by param", () => {
    const result = buildTransferQueryParams({ sort_by: "updated_at:desc" });
    expect(result).toEqual({ sort_by: "updated_at:desc" });
  });

  it("omits empty arrays", () => {
    const result = buildTransferQueryParams({
      status: [],
      beneficiary_ids: [],
      ids: [],
      recurring_transfer_ids: [],
    });
    expect(result).toEqual({});
  });
});

describe("getTransfer", () => {
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

  it("fetches a transfer by ID", async () => {
    const transfer = { id: "txfr-1", reference: "Invoice 001", amount: 100.5 };
    fetchSpy.mockReturnValue(jsonResponse({ transfer }));

    const result = await getTransfer(client, "txfr-1");
    expect(result).toEqual(transfer);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/txfr-1");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transfer: { id: "a/b" } }));

    await getTransfer(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/a%2Fb");
  });
});
