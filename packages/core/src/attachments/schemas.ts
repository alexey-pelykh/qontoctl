// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { Attachment } from "./types.js";

/**
 * Zod schema for an attachment returned by the Qonto API.
 */
export const AttachmentSchema = z.object({
  id: z.string(),
  file_name: z.string(),
  file_size: z.coerce.string(),
  file_content_type: z.string(),
  url: z.string(),
  created_at: z.string(),
}) satisfies z.ZodType<Attachment>;
