// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { IntlTransferRequirementsResponseSchema, IntlTransferResponseSchema } from "./schemas.js";
import type { CreateIntlTransferParams, IntlTransfer, IntlTransferRequirements } from "./types.js";

/**
 * Get the required fields for creating an international transfer for a specific beneficiary + quote.
 */
export async function getIntlTransferRequirements(
  client: HttpClient,
  id: string,
): Promise<IntlTransferRequirements> {
  const endpointPath = `/v2/international/transfers/${encodeURIComponent(id)}/requirements`;
  const response = await client.get(endpointPath);
  return parseResponse(IntlTransferRequirementsResponseSchema, response, endpointPath).requirements;
}

/**
 * Create an international transfer.
 */
export async function createIntlTransfer(
  client: HttpClient,
  params: CreateIntlTransferParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<IntlTransfer> {
  const endpointPath = "/v2/international/transfers";
  const response = await client.post(endpointPath, { international_transfer: params }, options);
  return parseResponse(IntlTransferResponseSchema, response, endpointPath).international_transfer;
}
