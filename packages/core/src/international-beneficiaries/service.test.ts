// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  listIntlBeneficiaries,
  getIntlBeneficiaryRequirements,
  createIntlBeneficiary,
  updateIntlBeneficiary,
  removeIntlBeneficiary,
} from "./service.js";

const sampleBeneficiary = {
  id: "intl-ben-1",
  name: "Global Corp",
  country: "US",
  currency: "USD",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

const sampleMeta = {
  current_page: 1,
  next_page: null,
  prev_page: null,
  total_pages: 1,
  total_count: 1,
  per_page: 100,
};

describe("listIntlBeneficiaries", () => {
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
    fetchSpy.mockReturnValue(
      jsonResponse({ international_beneficiaries: [sampleBeneficiary], meta: sampleMeta }),
    );

    const result = await listIntlBeneficiaries(client);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/international/beneficiaries");
    expect(result.international_beneficiaries).toHaveLength(1);
    expect(result.international_beneficiaries[0]).toHaveProperty("id", "intl-ben-1");
    expect(result.meta).toEqual(sampleMeta);
  });

  it("passes pagination params", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({ international_beneficiaries: [], meta: sampleMeta }),
    );

    await listIntlBeneficiaries(client, { current_page: 2, per_page: 10 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("current_page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });
});

describe("getIntlBeneficiaryRequirements", () => {
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
        { key: "account_number", name: "Account number", type: "text" },
        { key: "sort_code", name: "Sort code", type: "text", min_length: 6, max_length: 6 },
      ],
    };
    fetchSpy.mockReturnValue(jsonResponse({ requirements }));

    const result = await getIntlBeneficiaryRequirements(client, "intl-ben-1");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/international/beneficiaries/intl-ben-1/requirements");
    expect(result.fields).toHaveLength(2);
    expect(result.fields[0]).toHaveProperty("key", "account_number");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ requirements: { fields: [] } }));

    await getIntlBeneficiaryRequirements(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/international/beneficiaries/a%2Fb/requirements");
  });
});

describe("createIntlBeneficiary", () => {
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

  it("wraps params in an international_beneficiary key", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ international_beneficiary: sampleBeneficiary }));

    const result = await createIntlBeneficiary(client, {
      country: "US",
      currency: "USD",
      name: "Global Corp",
    });

    expect(result).toEqual(sampleBeneficiary);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/international/beneficiaries");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      international_beneficiary: {
        country: "US",
        currency: "USD",
        name: "Global Corp",
      },
    });
  });
});

describe("updateIntlBeneficiary", () => {
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

  it("wraps params in an international_beneficiary key and uses PATCH", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ international_beneficiary: sampleBeneficiary }));

    const result = await updateIntlBeneficiary(client, "intl-ben-1", {
      name: "Updated Global Corp",
    });

    expect(result).toEqual(sampleBeneficiary);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/international/beneficiaries/intl-ben-1");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      international_beneficiary: {
        name: "Updated Global Corp",
      },
    });
  });
});

describe("removeIntlBeneficiary", () => {
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

  it("calls DELETE on the correct endpoint", async () => {
    fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

    await removeIntlBeneficiary(client, "intl-ben-1");

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/international/beneficiaries/intl-ben-1");
    expect(opts.method).toBe("DELETE");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

    await removeIntlBeneficiary(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/international/beneficiaries/a%2Fb");
  });
});
