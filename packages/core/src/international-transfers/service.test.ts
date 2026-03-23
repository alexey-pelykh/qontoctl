// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { getIntlTransferRequirements, createIntlTransfer } from "./service.js";

const sampleTransfer = {
  id: "intl-txfr-1",
  beneficiary_id: "intl-ben-1",
  quote_id: "quote-1",
  status: "processing",
};

describe("getIntlTransferRequirements", () => {
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

  it("calls the correct endpoint", async () => {
    const requirements = {
      fields: [
        { key: "reference", name: "Reference", type: "text" },
        { key: "purpose_of_payment", name: "Purpose of payment", type: "text" },
      ],
    };
    fetchSpy.mockReturnValue(jsonResponse({ requirements }));

    const result = await getIntlTransferRequirements(client, "intl-ben-1");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/international/transfers/intl-ben-1/requirements");
    expect(result.fields).toHaveLength(2);
    expect(result.fields[0]).toHaveProperty("key", "reference");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ requirements: { fields: [] } }));

    await getIntlTransferRequirements(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/international/transfers/a%2Fb/requirements");
  });
});

describe("createIntlTransfer", () => {
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

  it("wraps params in an international_transfer key", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ international_transfer: sampleTransfer }));

    const result = await createIntlTransfer(client, {
      beneficiary_id: "intl-ben-1",
      quote_id: "quote-1",
      reference: "Invoice 42",
    });

    expect(result).toEqual(sampleTransfer);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/international/transfers");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      international_transfer: {
        beneficiary_id: "intl-ben-1",
        quote_id: "quote-1",
        reference: "Invoice 42",
      },
    });
  });
});
