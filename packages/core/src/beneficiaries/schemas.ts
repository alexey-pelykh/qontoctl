// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { Beneficiary } from "../types/beneficiary.js";

// https://docs.qonto.com/api-reference/business-api/payments-transfers/sepa-transfers/beneficiaries/sepa-beneficiaries/show
// https://docs.qonto.com/api-reference/business-api/payments-transfers/sepa-transfers/beneficiaries/sepa-beneficiaries/index
export const BeneficiarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    iban: z.string(),
    bic: z.string(),
    email: z.nullable(z.string()).optional().default(null),
    activity_tag: z.nullable(z.string()).optional().default(null),
    status: z.enum(["pending", "validated", "declined"]),
    trusted: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strip() satisfies z.ZodType<Beneficiary>;

export const BeneficiaryResponseSchema = z
  .object({
    beneficiary: BeneficiarySchema,
  })
  .strip();

export const BeneficiaryListResponseSchema = z
  .object({
    beneficiaries: z.array(BeneficiarySchema),
    meta: PaginationMetaSchema,
  })
  .strip();
