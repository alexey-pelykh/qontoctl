// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { PaginationMeta } from "../api-types.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { ProductListResponseSchema } from "./schemas.js";
import type { ListProductsParams, Product } from "./types.js";

/**
 * List products from the authenticated organization's catalogue.
 *
 * Required scope: `product.read`. Per the Qonto auth table the endpoint
 * accepts both api-key and OAuth bearer auth.
 */
export async function listProducts(
  client: HttpClient,
  params?: ListProductsParams,
): Promise<{ products: readonly Product[]; meta: PaginationMeta }> {
  const query: Record<string, string> = {};
  if (params) {
    if (params.page !== undefined) query["page"] = String(params.page);
    if (params.per_page !== undefined) query["per_page"] = String(params.per_page);
    if (params.sort_by !== undefined) query["sort_by"] = params.sort_by;
  }
  const endpointPath = "/v2/products";
  const response = await client.get(endpointPath, Object.keys(query).length > 0 ? query : undefined);
  return parseResponse(ProductListResponseSchema, response, endpointPath);
}
