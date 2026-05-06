// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  buildBeneficiaryQueryParams,
  createBeneficiary,
  getBeneficiary,
  listBeneficiaries,
  trustBeneficiaries,
  untrustBeneficiaries,
  updateBeneficiary,
} from "./service.js";
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

describe("listBeneficiaries", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  const MOCK_BENEFICIARY = {
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

  it("lists beneficiaries without params", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        beneficiaries: [MOCK_BENEFICIARY],
        meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 },
      }),
    );
    const result = await listBeneficiaries(client);
    expect(result.beneficiaries).toHaveLength(1);
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries");
  });

  it("passes filter and pagination params", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        beneficiaries: [],
        meta: { current_page: 2, next_page: 3, prev_page: 1, total_pages: 3, total_count: 50, per_page: 10 },
      }),
    );
    await listBeneficiaries(client, { page: 2, per_page: 10, status: ["validated"] });
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
    expect(url.searchParams.getAll("status[]")).toEqual(["validated"]);
  });
});

describe("trustBeneficiaries", () => {
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

  it("sends PATCH to /trust with ids", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));
    await trustBeneficiaries(client, ["ben-1", "ben-2"]);
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries/trust");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({ ids: ["ben-1", "ben-2"] });
  });
});

describe("untrustBeneficiaries", () => {
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

  it("sends PATCH to /untrust with ids", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));
    await untrustBeneficiaries(client, ["ben-1"]);
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/beneficiaries/untrust");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({ ids: ["ben-1"] });
  });
});
