// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { RecurringTransferSchema } from "./schemas.js";
import type { RecurringTransfer } from "./types.js";

/**
 * Fetch a single recurring transfer by ID.
 */
export async function getRecurringTransfer(client: HttpClient, id: string): Promise<RecurringTransfer> {
  const endpointPath = `/v2/sepa/recurring_transfers/${encodeURIComponent(id)}`;
  const response = await client.get<{ recurring_transfer: RecurringTransfer }>(endpointPath);
  return parseResponse(RecurringTransferSchema, response.recurring_transfer, endpointPath);
}
