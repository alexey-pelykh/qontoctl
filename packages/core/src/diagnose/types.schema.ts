// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { AUTH_PREFERENCES } from "../config/index.js";
import type { AuthPreference } from "../config/types.js";

/**
 * Zod schemas for the diagnose contract.
 *
 * Used to:
 * - Validate the MCP tool's output before returning to clients
 * - Round-trip JSON outputs in tests (`schema.parse(JSON.parse(stdout))`)
 *
 * Kept separate from `types.ts` so consumers wanting only TypeScript
 * types do not pull `zod` into their import graph unnecessarily.
 */

export const CheckStatusSchema = z.enum(["ok", "warn", "fail", "skip"]);

export const DiagnosticResultSchema = z
  .object({
    checkId: z.string(),
    status: CheckStatusSchema,
    detail: z.string(),
    suggestedAction: z.string().nullable(),
    evidence: z.record(z.string(), z.unknown()).optional(),
    latencyMs: z.number().optional(),
  })
  .strict();

export const SummaryCountsSchema = z
  .object({
    ok: z.number().int().nonnegative(),
    warn: z.number().int().nonnegative(),
    fail: z.number().int().nonnegative(),
    skip: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const DiagnosticReportSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    qontoctlVersion: z.string(),
    profile: z.string(),
    authMode: z.enum(AUTH_PREFERENCES as readonly [AuthPreference, ...AuthPreference[]]),
    configPath: z.string(),
    stagingTokenPresent: z.boolean(),
    results: z.array(DiagnosticResultSchema),
    summaryCounts: SummaryCountsSchema,
    capturedAt: z.string(),
  })
  .strict();
