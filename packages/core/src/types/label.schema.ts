// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { Label } from "./label.js";

export const LabelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    parent_id: z.string().nullable(),
  })
  .strip() satisfies z.ZodType<Label>;
