// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { Beneficiary } from "../types/beneficiary.js";

export const BeneficiarySchema = z.object({
  id: z.string(),
  name: z.string(),
  iban: z.string(),
  bic: z.string(),
  email: z.nullable(z.string()),
  activity_tag: z.nullable(z.string()),
  status: z.enum(["pending", "validated", "declined"]),
  trusted: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<Beneficiary>;

export const BeneficiaryResponseSchema = z.object({
  beneficiary: BeneficiarySchema,
});
