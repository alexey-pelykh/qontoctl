// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";
import type { RequestFlashCard, RequestMultiTransfer, RequestVirtualCard } from "../types/request.js";
import {
  RequestFlashCardSchema,
  RequestMultiTransferSchema,
  RequestVirtualCardSchema,
} from "../types/request.schema.js";
import type {
  ApproveRequestParams,
  CreateFlashCardRequestParams,
  CreateMultiTransferRequestParams,
  CreateVirtualCardRequestParams,
  DeclineRequestParams,
  RequestType,
} from "./types.js";

const FlashCardResponseSchema = z.object({ request_flash_card: RequestFlashCardSchema });
const VirtualCardResponseSchema = z.object({ request_virtual_card: RequestVirtualCardSchema });
const MultiTransferResponseSchema = z.object({ request_multi_transfer: RequestMultiTransferSchema });

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
  await client.post("/v2/requests/" + typePath + "/" + encodeURIComponent(id) + "/approve", params, options);
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
  await client.post("/v2/requests/" + typePath + "/" + encodeURIComponent(id) + "/decline", params, options);
}

/**
 * Create a flash card request.
 */
export async function createFlashCardRequest(
  client: HttpClient,
  params: CreateFlashCardRequestParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<RequestFlashCard> {
  const endpointPath = "/v2/requests/flash_cards";
  const response = await client.post(endpointPath, { request_flash_card: params }, options);
  return parseResponse(FlashCardResponseSchema, response, endpointPath).request_flash_card;
}

/**
 * Create a virtual card request.
 */
export async function createVirtualCardRequest(
  client: HttpClient,
  params: CreateVirtualCardRequestParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<RequestVirtualCard> {
  const endpointPath = "/v2/requests/virtual_cards";
  const response = await client.post(endpointPath, { request_virtual_card: params }, options);
  return parseResponse(VirtualCardResponseSchema, response, endpointPath).request_virtual_card;
}

/**
 * Create a multi-transfer request.
 */
export async function createMultiTransferRequest(
  client: HttpClient,
  params: CreateMultiTransferRequestParams,
  options?: { readonly idempotencyKey?: string; readonly scaSessionToken?: string },
): Promise<RequestMultiTransfer> {
  const endpointPath = "/v2/requests/multi_transfers";
  const response = await client.post(endpointPath, { request_multi_transfer: params }, options);
  return parseResponse(MultiTransferResponseSchema, response, endpointPath).request_multi_transfer;
}
