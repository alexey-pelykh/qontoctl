// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import type { CreateInternalTransferParams, InternalTransfer } from "./types.js";

/**
 * Create an internal transfer between two bank accounts
 * within the same Qonto organization.
 */
export async function createInternalTransfer(
  client: HttpClient,
  params: CreateInternalTransferParams,
  options?: { readonly idempotencyKey?: string },
): Promise<InternalTransfer> {
  const response = await client.post<{ internal_transfer: InternalTransfer }>(
    "/v2/internal_transfers",
    { internal_transfer: params },
    options,
  );
  return response.internal_transfer;
}
