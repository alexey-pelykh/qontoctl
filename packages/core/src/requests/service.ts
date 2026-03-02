// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { HttpClient } from "../http-client.js";
import type { RequestFlashCard, RequestMultiTransfer, RequestVirtualCard } from "../types/request.js";
import type {
  ApproveRequestParams,
  CreateFlashCardRequestParams,
  CreateMultiTransferRequestParams,
  CreateVirtualCardRequestParams,
  DeclineRequestParams,
  RequestType,
} from "./types.js";

/**
 * Maps request type discriminants to their API path segments (plural forms).
 */
const REQUEST_TYPE_PATH: Record<RequestType, string> = {
  flash_card: "flash_cards",
  virtual_card: "virtual_cards",
  transfer: "transfers",
  multi_transfer: "multi_transfers",
};

/**
 * Approve a pending request.
 */
export async function approveRequest(
  client: HttpClient,
  requestType: RequestType,
  id: string,
  params?: ApproveRequestParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  const typePath = REQUEST_TYPE_PATH[requestType];
  await client.post(
    "/v2/requests/" + typePath + "/" + encodeURIComponent(id) + "/approve",
    params,
    options,
  );
}

/**
 * Decline a pending request.
 */
export async function declineRequest(
  client: HttpClient,
  requestType: RequestType,
  id: string,
  params: DeclineRequestParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<void> {
  const typePath = REQUEST_TYPE_PATH[requestType];
  await client.post(
    "/v2/requests/" + typePath + "/" + encodeURIComponent(id) + "/decline",
    params,
    options,
  );
}

/**
 * Create a flash card request.
 */
export async function createFlashCardRequest(
  client: HttpClient,
  params: CreateFlashCardRequestParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<RequestFlashCard> {
  const response = await client.post<{ request_flash_card: RequestFlashCard }>(
    "/v2/requests/flash_cards",
    { request_flash_card: params },
    options,
  );
  return response.request_flash_card;
}

/**
 * Create a virtual card request.
 */
export async function createVirtualCardRequest(
  client: HttpClient,
  params: CreateVirtualCardRequestParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<RequestVirtualCard> {
  const response = await client.post<{ request_virtual_card: RequestVirtualCard }>(
    "/v2/requests/virtual_cards",
    { request_virtual_card: params },
    options,
  );
  return response.request_virtual_card;
}

/**
 * Create a multi-transfer request.
 */
export async function createMultiTransferRequest(
  client: HttpClient,
  params: CreateMultiTransferRequestParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<RequestMultiTransfer> {
  const response = await client.post<{ request_multi_transfer: RequestMultiTransfer }>(
    "/v2/requests/multi_transfers",
    { request_multi_transfer: params },
    options,
  );
  return response.request_multi_transfer;
}
