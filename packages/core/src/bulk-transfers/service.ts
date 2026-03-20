// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import { BulkTransferSchema } from "./schemas.js";
import type { BulkTransfer } from "./types.js";

/**
 * Fetch a single bulk transfer by ID.
 */
export async function getBulkTransfer(client: HttpClient, id: string): Promise<BulkTransfer> {
  const endpointPath = `/v2/sepa/bulk_transfers/${encodeURIComponent(id)}`;
  const response = await client.get<{ bulk_transfer: BulkTransfer }>(endpointPath);
  return parseResponse(BulkTransferSchema, response.bulk_transfer, endpointPath);
}
