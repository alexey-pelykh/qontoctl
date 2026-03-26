// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  buildClientInvoiceQueryParams,
  listClientInvoices,
  getClientInvoice,
  createClientInvoice,
  updateClientInvoice,
  deleteClientInvoice,
  finalizeClientInvoice,
  sendClientInvoice,
  markClientInvoicePaid,
  unmarkClientInvoicePaid,
  cancelClientInvoice,
  uploadClientInvoiceFile,
  getClientInvoiceUpload,
} from "./service.js";

export type {
  ClientInvoice,
  ClientInvoiceAmount,
  ClientInvoiceDiscount,
  ClientInvoiceItem,
  ClientInvoiceItemParams,
  ClientInvoiceDiscountParams,
  ClientInvoiceAddress,
  ClientInvoiceClient,
  ClientInvoiceUpload,
  CreateClientInvoiceParams,
  UpdateClientInvoiceParams,
  ListClientInvoicesParams,
} from "./types.js";

export {
  ClientInvoiceAmountSchema,
  ClientInvoiceDiscountSchema,
  ClientInvoiceItemSchema,
  ClientInvoiceAddressSchema,
  ClientInvoiceClientSchema,
  ClientInvoiceUploadSchema,
  ClientInvoiceSchema,
  ClientInvoiceResponseSchema,
  ClientInvoiceListResponseSchema,
} from "./schemas.js";
