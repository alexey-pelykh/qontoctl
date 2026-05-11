// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  uploadAttachment,
  getAttachment,
  listTransactionAttachments,
  addTransactionAttachment,
  removeAllTransactionAttachments,
  removeTransactionAttachment,
} from "./service.js";

export type { Attachment, UploadedAttachment } from "./types.js";

export { AttachmentSchema, UploadedAttachmentSchema } from "./schemas.js";
