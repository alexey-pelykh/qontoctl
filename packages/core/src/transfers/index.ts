// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  buildTransferQueryParams,
  listTransfers,
  getTransfer,
  createTransfer,
  cancelTransfer,
  getTransferProof,
  verifyPayee,
  bulkVerifyPayee,
} from "./service.js";

export {
  TransferSchema,
  TransferResponseSchema,
  TransferListResponseSchema,
  VopMatchResultSchema,
  VopResultSchema,
  VopResultResponseSchema,
  BulkVopResultEntrySchema,
  BulkVopResultResponseSchema,
} from "./schemas.js";

export type {
  Transfer,
  InlineBeneficiary,
  ListTransfersParams,
  CreateTransferParams,
  VopMatchResult,
  VopEntry,
  VopResult,
  BulkVopResultEntry,
  BulkVopResult,
} from "./types.js";
