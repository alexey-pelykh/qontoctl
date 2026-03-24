// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { buildStatementQueryParams, getStatement, listStatements } from "./service.js";
import type { ListStatementsParams } from "./types.js";

const validStatement = {
  id: "stmt-1",
  bank_account_id: "acc-1",
  period: "01-2026",
  file: {
    file_name: "statement-01-2026.pdf",
    file_content_type: "application/pdf",
    file_size: "12345",
    file_url: "https://example.com/statement.pdf",
  },
};

describe("buildStatementQueryParams", () => {
  it("returns empty object for empty params", () => {
    const result = buildStatementQueryParams({});
    expect(result).toEqual({});
  });

  it("maps bank_account_ids as array param with [] suffix", () => {
    const params: ListStatementsParams = {
      bank_account_ids: ["acc-1", "acc-2"],
    };
    const result = buildStatementQueryParams(params);
    expect(result).toEqual({
      "bank_account_ids[]": ["acc-1", "acc-2"],
    });
  });

  it("maps scalar string params", () => {
    const params: ListStatementsParams = {
      period_from: "01-2025",
      period_to: "12-2025",
      sort_by: "period:desc",
    };
    const result = buildStatementQueryParams(params);
    expect(result).toEqual({
      period_from: "01-2025",
      period_to: "12-2025",
      sort_by: "period:desc",
    });
  });

  it("omits empty bank_account_ids array", () => {
    const result = buildStatementQueryParams({
      bank_account_ids: [],
    });
    expect(result).toEqual({});
  });
});

describe("getStatement", () => {
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

  it("fetches a statement by ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ statement: validStatement }));

    const result = await getStatement(client, "stmt-1");
    expect(result).toEqual(validStatement);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/statements/stmt-1");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ statement: { ...validStatement, id: "a/b" } }));

    await getStatement(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/statements/a%2Fb");
  });
});

describe("listStatements", () => {
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

  it("lists statements without params", async () => {
    const body = {
      statements: [validStatement],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listStatements(client);
    expect(result.statements).toHaveLength(1);
    expect(result.meta.current_page).toBe(1);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/statements");
    expect(url.search).toBe("");
  });

  it("passes filter and pagination params as query strings", async () => {
    const body = {
      statements: [],
      meta: { current_page: 2, next_page: null, prev_page: 1, total_pages: 2, total_count: 30, per_page: 10 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listStatements(client, {
      bank_account_ids: ["acc-1"],
      period_from: "01-2025",
      page: 2,
      per_page: 10,
    });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("bank_account_ids[]")).toEqual(["acc-1"]);
    expect(url.searchParams.get("period_from")).toBe("01-2025");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  it("omits undefined pagination params", async () => {
    const body = {
      statements: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listStatements(client, { page: 3 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.has("per_page")).toBe(false);
  });
});
