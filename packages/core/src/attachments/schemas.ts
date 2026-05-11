// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { Attachment, UploadedAttachment } from "./types.js";

/**
 * Zod schema for a fully-populated attachment as returned by the attachment
 * get/list endpoints.
 */
export const AttachmentSchema = z
  .object({
    id: z.string(),
    file_name: z.string(),
    file_size: z.coerce.string(),
    file_content_type: z.string(),
    url: z.string(),
    created_at: z.string(),
  })
  .strip() satisfies z.ZodType<Attachment>;

/**
 * Zod schema for the response shape of `POST /v2/attachments` (standalone
 * upload), which the Qonto API returns with only the attachment ID populated.
 * See {@link UploadedAttachment} for rationale.
 */
export const UploadedAttachmentSchema = z
  .object({
    id: z.string(),
  })
  .strip() satisfies z.ZodType<UploadedAttachment>;
