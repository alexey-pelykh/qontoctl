// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient, PaginationMeta, QueryParams } from "@qontoctl/core";
import type { PaginationOptions } from "./options.js";

/**
 * A single page of results from a paginated API endpoint.
 */
export interface Page<T> {
  readonly items: readonly T[];
  readonly meta: PaginationMeta;
}

/**
 * Combined result from fetching one or more pages.
 */
export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly meta: PaginationMeta;
}

const DEFAULT_PER_PAGE = 100;
const MAX_PAGES = 1000;

/**
 * Fetch a single page from a paginated Qonto API endpoint.
 *
 * @param client - The HTTP client to use for the request.
 * @param path - The API path (e.g., `/v2/transactions`).
 * @param collectionKey - The key in the response containing the items array.
 * @param page - The page number (1-based).
 * @param perPage - Number of items per page.
 * @param params - Additional query parameters.
 */
export async function fetchPage<T>(
  client: HttpClient,
  path: string,
  collectionKey: string,
  page: number,
  perPage: number,
  params?: QueryParams,
): Promise<Page<T>> {
  const queryParams: QueryParams = {
    ...params,
    current_page: String(page),
    per_page: String(perPage),
  };

  const response = await client.get<Record<string, unknown>>(path, queryParams);
  const items = (response[collectionKey] ?? []) as T[];
  const meta = response["meta"] as PaginationMeta;

  return { items, meta };
}

/**
 * Fetch all pages from a paginated endpoint, combining items into a single array.
 *
 * @param client - The HTTP client to use for requests.
 * @param path - The API path.
 * @param collectionKey - The key in the response containing the items array.
 * @param perPage - Number of items per page.
 * @param params - Additional query parameters.
 */
export async function fetchAllPages<T>(
  client: HttpClient,
  path: string,
  collectionKey: string,
  perPage: number,
  params?: QueryParams,
): Promise<PaginatedResult<T>> {
  const firstPage = await fetchPage<T>(client, path, collectionKey, 1, perPage, params);
  const allItems: T[] = [...firstPage.items];

  let currentMeta = firstPage.meta;
  let pagesFetched = 1;
  while (currentMeta.next_page !== null) {
    if (pagesFetched >= MAX_PAGES) {
      break;
    }
    const nextPage = await fetchPage<T>(client, path, collectionKey, currentMeta.next_page, perPage, params);
    allItems.push(...nextPage.items);
    currentMeta = nextPage.meta;
    pagesFetched++;
  }

  return {
    items: allItems,
    meta: {
      ...currentMeta,
      current_page: 1,
      next_page: null,
      prev_page: null,
      total_pages: currentMeta.total_pages,
      total_count: currentMeta.total_count,
      per_page: perPage,
    },
  };
}

/**
 * Fetch data from a paginated endpoint based on CLI pagination options.
 *
 * - Default (no flags): auto-paginate across all pages.
 * - `--page N`: fetch only page N.
 * - `--no-paginate`: fetch only the first page (disable auto-pagination).
 *
 * @param client - The HTTP client to use for requests.
 * @param path - The API path.
 * @param collectionKey - The key in the response containing the items array.
 * @param paginationOptions - Parsed pagination CLI options.
 * @param params - Additional query parameters.
 */
export async function fetchPaginated<T>(
  client: HttpClient,
  path: string,
  collectionKey: string,
  paginationOptions: PaginationOptions,
  params?: QueryParams,
): Promise<PaginatedResult<T>> {
  const perPage = paginationOptions.perPage ?? DEFAULT_PER_PAGE;

  if (paginationOptions.page !== undefined) {
    const page = await fetchPage<T>(client, path, collectionKey, paginationOptions.page, perPage, params);
    return { items: page.items, meta: page.meta };
  }

  if (!paginationOptions.paginate) {
    const page = await fetchPage<T>(client, path, collectionKey, 1, perPage, params);
    return { items: page.items, meta: page.meta };
  }

  return fetchAllPages<T>(client, path, collectionKey, perPage, params);
}
