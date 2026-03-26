// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { Team } from "./team.js";

export const TeamSchema = z
  .object({
    id: z.string(),
    name: z.string(),
  })
  .strip() satisfies z.ZodType<Team>;

export const TeamResponseSchema = z
  .object({
    team: TeamSchema,
  })
  .strip();

export const TeamListResponseSchema = z
  .object({
    teams: z.array(TeamSchema),
    meta: PaginationMetaSchema,
  })
  .strip();
