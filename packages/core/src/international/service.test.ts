// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { getIntlEligibility, listIntlCurrencies, createIntlQuote } from "./service.js";

describe("getIntlEligibility", () => {
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

  it("returns the (flat) eligibility from the API response", async () => {
    const eligibility = { status: "STATUS_INELIGIBLE", reason: "REASON_UNKNOWN" };
    fetchSpy.mockReturnValue(jsonResponse(eligibility));

    const result = await getIntlEligibility(client);

    expect(result).toEqual(eligibility);
    expect(result.status).toBe("STATUS_INELIGIBLE");
    expect(result.reason).toBe("REASON_UNKNOWN");
  });

  it("returns eligibility without reason when not present", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ status: "STATUS_ELIGIBLE" }));

    const result = await getIntlEligibility(client);

    expect(result.status).toBe("STATUS_ELIGIBLE");
    expect(result.reason).toBeUndefined();
  });

  it("calls the correct endpoint", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ status: "STATUS_ELIGIBLE" }));

    await getIntlEligibility(client);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/international/eligibility");
  });
});

describe("listIntlCurrencies", () => {
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

  it("returns currencies from the API response", async () => {
    const currencies = [
      { country_code: "US", currency_code: "USD", suggestion_priority: 6 },
      { country_code: "GB", currency_code: "GBP" },
    ];
    fetchSpy.mockReturnValue(jsonResponse({ currencies }));

    const result = await listIntlCurrencies(client, "EUR");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(currencies[0]);
    expect(result[1]?.currency_code).toBe("GBP");
  });

  it("calls the correct endpoint with the source query param", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ currencies: [] }));

    await listIntlCurrencies(client, "EUR");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/international/currencies");
    expect(url.searchParams.get("source")).toBe("EUR");
  });
});

describe("createIntlQuote", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  const sampleQuote = {
    id: "quote-1",
    source_currency: "EUR",
    target_currency: "USD",
    source_amount: 1000,
    target_amount: 1085.5,
    rate: 1.0855,
    fee_amount: 5.0,
    fee_currency: "EUR",
    expires_at: "2026-03-25T12:00:00Z",
  };

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

  it("returns the quote from the API response", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

    const result = await createIntlQuote(client, {
      currency: "USD",
      amount: 1000,
      direction: "send",
    });

    expect(result).toEqual(sampleQuote);
    expect(result.id).toBe("quote-1");
  });

  it("calls the correct endpoint with POST", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

    await createIntlQuote(client, {
      currency: "USD",
      amount: 1000,
      direction: "send",
    });

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/international/quotes");
    expect(opts.method).toBe("POST");
  });

  it("wraps params in a quote key", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

    await createIntlQuote(client, {
      currency: "USD",
      amount: 1000,
      direction: "send",
    });

    const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      quote: {
        currency: "USD",
        amount: 1000,
        direction: "send",
      },
    });
  });
});
