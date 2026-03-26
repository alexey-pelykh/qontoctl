// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { IntlTransfer, IntlTransferRequirementField, IntlTransferRequirements } from "./types.js";

// International transfer schemas use .loose() to pass through unknown fields.
// These endpoints are less stable and may return additional undocumented properties.
export const IntlTransferRequirementFieldSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    type: z.string(),
    example: z.string().optional(),
    validation_regexp: z.string().optional(),
    min_length: z.number().optional(),
    max_length: z.number().optional(),
  })
  .loose() satisfies z.ZodType<IntlTransferRequirementField>;

export const IntlTransferRequirementsSchema = z
  .object({
    fields: z.array(IntlTransferRequirementFieldSchema),
  })
  .loose() satisfies z.ZodType<IntlTransferRequirements>;

export const IntlTransferRequirementsResponseSchema = z
  .object({
    requirements: IntlTransferRequirementsSchema,
  })
  .strip();

export const IntlTransferSchema = z
  .object({
    id: z.string(),
  })
  .loose() satisfies z.ZodType<IntlTransfer>;

export const IntlTransferResponseSchema = z
  .object({
    international_transfer: IntlTransferSchema,
  })
  .strip();
