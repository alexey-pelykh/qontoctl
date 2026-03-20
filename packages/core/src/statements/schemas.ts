// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { Statement, StatementFile } from "./types.js";

/**
 * Zod schema for statement file metadata.
 */
export const StatementFileSchema = z.object({
  file_name: z.string(),
  file_content_type: z.string(),
  file_size: z.string(),
  file_url: z.string(),
}) satisfies z.ZodType<StatementFile>;

/**
 * Zod schema for a bank statement returned by the Qonto API.
 */
export const StatementSchema = z.object({
  id: z.string(),
  bank_account_id: z.string(),
  period: z.string(),
  file: StatementFileSchema,
}) satisfies z.ZodType<Statement>;
