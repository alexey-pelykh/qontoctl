// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { ScaSession } from "./types.js";

/**
 * Zod schema for the SCA session status values.
 */
export const ScaSessionStatusSchema = z.enum(["waiting", "allow", "deny"]);

/**
 * Zod schema for an SCA session.
 *
 * Note: The API response contains only `status` inside the `sca_session` envelope.
 * The `token` field is added by the service layer from the request parameter.
 */
export const ScaSessionSchema = z.object({
  token: z.string(),
  status: ScaSessionStatusSchema,
}) satisfies z.ZodType<ScaSession>;
