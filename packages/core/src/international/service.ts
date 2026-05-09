// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { IntlCurrencyListResponseSchema, IntlEligibilitySchema, IntlQuoteResponseSchema } from "./schemas.js";
import type { CreateIntlQuoteParams, IntlCurrency, IntlEligibility, IntlQuote } from "./types.js";

/**
 * Check eligibility for international transfers.
 *
 * The endpoint returns the eligibility object flat (no `eligibility` wrapper).
 */
export async function getIntlEligibility(client: HttpClient): Promise<IntlEligibility> {
  const endpointPath = "/v2/international/eligibility";
  const response = await client.get(endpointPath);
  return parseResponse(IntlEligibilitySchema, response, endpointPath);
}

/**
 * List supported currencies for international transfers.
 *
 * Requires a source currency: the endpoint rejects requests without `?source=`
 * with HTTP 400 (`Field validation for 'FromCurrency' failed on the 'required'
 * tag`).
 */
export async function listIntlCurrencies(client: HttpClient, source: string): Promise<IntlCurrency[]> {
  const endpointPath = "/v2/international/currencies";
  const response = await client.get(endpointPath, { source });
  return parseResponse(IntlCurrencyListResponseSchema, response, endpointPath).currencies;
}

/**
 * Create an international transfer quote with exchange rate.
 */
export async function createIntlQuote(client: HttpClient, params: CreateIntlQuoteParams): Promise<IntlQuote> {
  const endpointPath = "/v2/international/quotes";
  const response = await client.post(endpointPath, { quote: params });
  return parseResponse(IntlQuoteResponseSchema, response, endpointPath).quote;
}
