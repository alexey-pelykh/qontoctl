// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { buildBeneficiaryQueryParams, createBeneficiary, getBeneficiary, updateBeneficiary } from "./service.js";
import type { ListBeneficiariesParams } from "./types.js";

describe("buildBeneficiaryQueryParams", () => {
  it("returns empty object for empty params", () => {
    const result = buildBeneficiaryQueryParams({});
    expect(result).toEqual({});
  });

  it("maps scalar string params", () => {
    const params: ListBeneficiariesParams = {
      updated_at_from: "2025-01-01T00:00:00Z",
      updated_at_to: "2025-01-31T23:59:59Z",
      sort_by: "updated_at:desc",
    };
    const result = buildBeneficiaryQueryParams(params);
    expect(result).toEqual({
      updated_at_from: "2025-01-01T00:00:00Z",
      updated_at_to: "2025-01-31T23:59:59Z",
      sort_by: "updated_at:desc",
    });
  });

  it("maps array params with [] suffix", () => {
    const params: ListBeneficiariesParams = {
      status: ["pending", "validated"],
      iban: ["FR7630001007941234567890185"],
    };
    const result = buildBeneficiaryQueryParams(params);
    expect(result).toEqual({
      "status[]": ["pending", "validated"],
      "iban[]": ["FR7630001007941234567890185"],
    });
  });

  it("maps trusted boolean to string", () => {
    const result = buildBeneficiaryQueryParams({ trusted: true });
    expect(result).toEqual({ trusted: "true" });
  });

  it("omits empty arrays", () => {
    const result = buildBeneficiaryQueryParams({
      status: [],
      iban: [],
    });
    expect(result).toEqual({});
  });
});

describe("getBeneficiary", () => {
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

  it("fetches a beneficiary by ID", async () => {
    const beneficiary = {
      id: "ben-1",
      name: "Acme Corp",
      iban: "FR7630001007941234567890185",
      bic: "BNPAFRPP",
      email: null,
      activity_tag: null,
      status: "validated",
      trusted: true,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-02T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ beneficiary }));

    const result = await getBeneficiary(client, "ben-1");
    expect(result).toEqual(beneficiary);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries/ben-1");
  });

  it("encodes special characters in the ID", async () => {
    const beneficiary = {
      id: "a/b",
      name: "Test",
      iban: "FR76X",
      bic: "BNPAFRPP",
      email: null,
      activity_tag: null,
      status: "pending",
      trusted: false,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ beneficiary }));

    await getBeneficiary(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries/a%2Fb");
  });
});

describe("createBeneficiary", () => {
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

  it("wraps params in a beneficiary key", async () => {
    const beneficiary = {
      id: "ben-new",
      name: "Acme Corp",
      iban: "FR7630001007941234567890185",
      bic: "BNPAFRPP",
      email: null,
      activity_tag: null,
      status: "pending",
      trusted: false,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ beneficiary }));

    const result = await createBeneficiary(client, {
      name: "Acme Corp",
      iban: "FR7630001007941234567890185",
      bic: "BNPAFRPP",
    });

    expect(result).toEqual(beneficiary);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      beneficiary: {
        name: "Acme Corp",
        iban: "FR7630001007941234567890185",
        bic: "BNPAFRPP",
      },
    });
  });
});

describe("updateBeneficiary", () => {
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

  it("wraps params in a beneficiary key", async () => {
    const beneficiary = {
      id: "ben-1",
      name: "Updated Corp",
      iban: "FR7630001007941234567890185",
      bic: "BNPAFRPP",
      email: null,
      activity_tag: null,
      status: "validated",
      trusted: true,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-02T00:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ beneficiary }));

    const result = await updateBeneficiary(client, "ben-1", {
      name: "Updated Corp",
    });

    expect(result).toEqual(beneficiary);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries/ben-1");
    expect(opts.method).toBe("PUT");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      beneficiary: {
        name: "Updated Corp",
      },
    });
  });
});
