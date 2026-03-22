// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { Membership } from "./membership.js";

export const MembershipSchema = z
  .object({
    id: z.string(),
    first_name: z.string(),
    last_name: z.string(),
    email: z.string().optional(),
    role: z.enum(["owner", "admin", "manager", "reporting", "employee", "accountant"]),
    team_id: z.string(),
    residence_country: z.string().nullable().optional(),
    birthdate: z.string().nullable().optional(),
    nationality: z.string().nullable().optional(),
    birth_country: z.string().nullable().optional(),
    ubo: z.boolean().nullable().optional(),
    status: z.string(),
  })
  .strip() satisfies z.ZodType<Membership>;

export const MembershipResponseSchema = z.object({
  membership: MembershipSchema,
});

export const MembershipListResponseSchema = z.object({
  memberships: z.array(MembershipSchema),
  meta: PaginationMetaSchema,
});
