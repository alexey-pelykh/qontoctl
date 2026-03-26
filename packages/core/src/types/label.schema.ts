// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { Label } from "./label.js";

export const LabelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    parent_id: z.string().nullable(),
  })
  .strip() satisfies z.ZodType<Label>;

export const LabelResponseSchema = z
  .object({
    label: LabelSchema,
  })
  .strip();

export const LabelListResponseSchema = z
  .object({
    labels: z.array(LabelSchema),
    meta: PaginationMetaSchema,
  })
  .strip();
