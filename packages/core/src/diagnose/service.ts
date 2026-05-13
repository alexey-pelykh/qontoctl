// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { diagnosticRegistry } from "./registry.js";
import { runChecks } from "./runner.js";
import type { DiagnoseContext, DiagnosticReport, DiagnosticResult, SummaryCounts } from "./types.js";

/**
 * Execute the default diagnostic registry against `ctx` and assemble the
 * final {@link DiagnosticReport}. Pure with respect to the context — no
 * persistence, no global state.
 *
 * The function is the single entry point used by both the CLI command and
 * the MCP tool, so any added check immediately surfaces in both surfaces
 * without per-surface wiring.
 */
export async function runDiagnose(ctx: DiagnoseContext): Promise<DiagnosticReport> {
  const results = await runChecks(diagnosticRegistry, ctx);
  return {
    schemaVersion: "1.0",
    qontoctlVersion: ctx.qontoctlVersion,
    profile: ctx.profile,
    authMode: ctx.authMode,
    configPath: ctx.configPath ?? "<env>",
    stagingTokenPresent: ctx.stagingTokenPresent,
    results,
    summaryCounts: computeSummaryCounts(results),
    capturedAt: ctx.frozenTimestamp ? "<frozen>" : new Date().toISOString(),
  };
}

/**
 * Roll up per-status counts from a result list. Always emits all four
 * status keys (even when zero) plus `total`, so consumers get a stable
 * shape and can subscript without optionality.
 */
export function computeSummaryCounts(results: readonly DiagnosticResult[]): SummaryCounts {
  let ok = 0;
  let warn = 0;
  let fail = 0;
  let skip = 0;
  for (const r of results) {
    switch (r.status) {
      case "ok":
        ok++;
        break;
      case "warn":
        warn++;
        break;
      case "fail":
        fail++;
        break;
      case "skip":
        skip++;
        break;
    }
  }
  return { ok, warn, fail, skip, total: results.length };
}
