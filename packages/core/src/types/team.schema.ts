// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { Team } from "./team.js";

export const TeamSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .strip() satisfies z.ZodType<Team>;
