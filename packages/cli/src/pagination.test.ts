// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "@qontoctl/core";
import { jsonResponse } from "@qontoctl/core/testing";
import { fetchPage, fetchAllPages, fetchPaginated } from "./pagination.js";
import type { PaginationMeta } from "./pagination.js";

function makeMeta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 0,
    per_page: 100,
    ...overrides,
  };
}

describe("pagination", () => {
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

  describe("fetchPage", () => {
    it("fetches a single page with correct query params", async () => {
      const items = [{ id: "1" }, { id: "2" }];
      const meta = makeMeta({ current_page: 1, total_count: 2 });
      fetchSpy.mockImplementation(() => jsonResponse({ transactions: items, meta }));

      const result = await fetchPage(client, "/v2/transactions", "transactions", 1, 100);

      expect(result.items).toEqual(items);
      expect(result.meta).toEqual(meta);

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("1");
      expect(url.searchParams.get("per_page")).toBe("100");
    });

    it("passes additional query params", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ transactions: [], meta: makeMeta() }));

      await fetchPage(client, "/v2/transactions", "transactions", 1, 50, {
        bank_account_id: "abc",
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("bank_account_id")).toBe("abc");
    });

    it("returns empty items when collection key is missing", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ meta: makeMeta() }));

      const result = await fetchPage(client, "/v2/things", "things", 1, 100);
      expect(result.items).toEqual([]);
    });
  });

  describe("fetchAllPages", () => {
    it("fetches all pages and combines items", async () => {
      const page1Items = [{ id: "1" }, { id: "2" }];
      const page2Items = [{ id: "3" }];

      fetchSpy
        .mockReturnValueOnce(
          jsonResponse({
            items: page1Items,
            meta: makeMeta({
              current_page: 1,
              next_page: 2,
              total_pages: 2,
              total_count: 3,
            }),
          }),
        )
        .mockReturnValueOnce(
          jsonResponse({
            items: page2Items,
            meta: makeMeta({
              current_page: 2,
              next_page: null,
              prev_page: 1,
              total_pages: 2,
              total_count: 3,
            }),
          }),
        );

      const result = await fetchAllPages(client, "/v2/items", "items", 100);

      expect(result.items).toEqual([...page1Items, ...page2Items]);
      expect(result.meta.total_count).toBe(3);
      expect(result.meta.total_pages).toBe(2);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("returns single page when there is only one", async () => {
      const items = [{ id: "1" }];
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          items,
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const result = await fetchAllPages(client, "/v2/items", "items", 100);
      expect(result.items).toEqual(items);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("stops at MAX_PAGES safety limit", async () => {
      // Always return a next_page to simulate infinite pagination
      fetchSpy.mockImplementation(() => {
        const callCount = fetchSpy.mock.calls.length;
        return jsonResponse({
          items: [{ id: String(callCount) }],
          meta: makeMeta({
            current_page: callCount,
            next_page: callCount + 1,
            total_pages: 9999,
            total_count: 9999,
          }),
        });
      });

      const result = await fetchAllPages(client, "/v2/items", "items", 1);

      // MAX_PAGES is 1000, so it should stop after 1000 fetches
      expect(fetchSpy).toHaveBeenCalledTimes(1000);
      expect(result.items).toHaveLength(1000);
    });
  });

  describe("fetchPaginated", () => {
    it("fetches a specific page when --page is set", async () => {
      const items = [{ id: "3" }];
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          items,
          meta: makeMeta({ current_page: 2, total_pages: 3, total_count: 5 }),
        }),
      );

      const result = await fetchPaginated(client, "/v2/items", "items", {
        page: 2,
        paginate: true,
      });

      expect(result.items).toEqual(items);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("2");
    });

    it("fetches only first page when --no-paginate is set", async () => {
      const items = [{ id: "1" }, { id: "2" }];
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          items,
          meta: makeMeta({
            current_page: 1,
            next_page: 2,
            total_pages: 3,
            total_count: 50,
          }),
        }),
      );

      const result = await fetchPaginated(client, "/v2/items", "items", {
        paginate: false,
      });

      expect(result.items).toEqual(items);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("auto-paginates all pages by default", async () => {
      fetchSpy
        .mockReturnValueOnce(
          jsonResponse({
            items: [{ id: "1" }],
            meta: makeMeta({
              current_page: 1,
              next_page: 2,
              total_pages: 2,
              total_count: 2,
            }),
          }),
        )
        .mockReturnValueOnce(
          jsonResponse({
            items: [{ id: "2" }],
            meta: makeMeta({
              current_page: 2,
              next_page: null,
              prev_page: 1,
              total_pages: 2,
              total_count: 2,
            }),
          }),
        );

      const result = await fetchPaginated(client, "/v2/items", "items", {
        paginate: true,
      });

      expect(result.items).toEqual([{ id: "1" }, { id: "2" }]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("uses custom --per-page value", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          items: [{ id: "1" }],
          meta: makeMeta({ per_page: 25 }),
        }),
      );

      await fetchPaginated(client, "/v2/items", "items", {
        perPage: 25,
        paginate: false,
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("per_page")).toBe("25");
    });
  });
});
