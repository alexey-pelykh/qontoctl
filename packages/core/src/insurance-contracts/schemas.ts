// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { InsuranceContract, InsuranceDocument } from "./types.js";

export const InsuranceDocumentSchema = z.object({
  id: z.string(),
  file_name: z.string(),
  file_size: z.coerce.string(),
  file_content_type: z.string(),
  url: z.string(),
  created_at: z.string(),
}) satisfies z.ZodType<InsuranceDocument>;

export const InsuranceContractSchema = z.object({
  id: z.string(),
  insurance_type: z.string(),
  status: z.string(),
  provider_name: z.string(),
  contract_number: z.string().nullable(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<InsuranceContract>;

export const InsuranceContractResponseSchema = z.object({
  insurance_contract: InsuranceContractSchema,
});

export const InsuranceDocumentResponseSchema = z.object({
  insurance_document: InsuranceDocumentSchema,
});
