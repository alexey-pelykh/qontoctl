// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { IntlTransfer, IntlTransferRequirementField, IntlTransferRequirements } from "./types.js";

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

export const IntlTransferRequirementsResponseSchema = z.object({
  requirements: IntlTransferRequirementsSchema,
});

export const IntlTransferSchema = z
  .object({
    id: z.string(),
  })
  .loose() satisfies z.ZodType<IntlTransfer>;

export const IntlTransferResponseSchema = z.object({
  international_transfer: IntlTransferSchema,
});
