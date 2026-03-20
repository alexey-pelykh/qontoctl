// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  approveRequest,
  declineRequest,
  createFlashCardRequest,
  createVirtualCardRequest,
  createMultiTransferRequest,
} from "./service.js";

export type {
  RequestType,
  ApproveRequestParams,
  DeclineRequestParams,
  CreateFlashCardRequestParams,
  CreateVirtualCardRequestParams,
  MultiTransferItem,
  CreateMultiTransferRequestParams,
} from "./types.js";

export {
  RequestFlashCardSchema,
  RequestVirtualCardSchema,
  RequestTransferSchema,
  RequestMultiTransferSchema,
  RequestSchema,
  RequestListResponseSchema,
} from "../types/request.schema.js";
