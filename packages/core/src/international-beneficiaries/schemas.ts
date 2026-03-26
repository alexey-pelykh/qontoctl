// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { IntlBeneficiary, IntlBeneficiaryRequirementField, IntlBeneficiaryRequirements } from "./types.js";

// International beneficiary schemas use .loose() to pass through unknown fields.
// These endpoints are less stable and may return additional undocumented properties.
export const IntlBeneficiarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    country: z.string(),
    currency: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .loose() satisfies z.ZodType<IntlBeneficiary>;

export const IntlBeneficiaryResponseSchema = z
  .object({
    international_beneficiary: IntlBeneficiarySchema,
  })
  .strip();

export const IntlBeneficiaryListResponseSchema = z
  .object({
    international_beneficiaries: z.array(IntlBeneficiarySchema),
    meta: PaginationMetaSchema,
  })
  .strip();

export const IntlBeneficiaryRequirementFieldSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    type: z.string(),
    example: z.string().optional(),
    validation_regexp: z.string().optional(),
    min_length: z.number().optional(),
    max_length: z.number().optional(),
  })
  .loose() satisfies z.ZodType<IntlBeneficiaryRequirementField>;

export const IntlBeneficiaryRequirementsSchema = z
  .object({
    fields: z.array(IntlBeneficiaryRequirementFieldSchema),
  })
  .loose() satisfies z.ZodType<IntlBeneficiaryRequirements>;

export const IntlBeneficiaryRequirementsResponseSchema = z
  .object({
    requirements: IntlBeneficiaryRequirementsSchema,
  })
  .strip();
