// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { applyTripwire, type CheckStatus, type DiagnosticReport, type RedactionContext } from "@qontoctl/core";

const UNICODE_MARKERS: Record<CheckStatus, string> = {
  ok: "✓",
  warn: "⚠",
  fail: "✗",
  skip: "—",
};

const ASCII_MARKERS: Record<CheckStatus, string> = {
  ok: "[OK]",
  warn: "[WARN]",
  fail: "[FAIL]",
  skip: "[SKIP]",
};

export interface DiagnoseRenderResult {
  readonly rendered: string;
  readonly leaks: readonly string[];
}

/**
 * Render a {@link DiagnosticReport} as a human-readable plain-text table
 * with status markers, ID alignment, detail strings, and a summary line.
 *
 * Pipes the rendered string through the global tripwire so any
 * stray secret in `detail` strings is scrubbed before display. Returns
 * the tripwire's `leaks` array alongside the cleaned output so the CLI
 * can surface defense-in-depth saves to `--verbose` / `--debug`.
 *
 * `verbose` adds a JSON fragment of `evidence` and `suggested_action`
 * under each check; useful when triaging a failed run.
 */
export function formatDiagnoseTable(
  report: DiagnosticReport,
  options: { ascii?: boolean; verbose?: boolean; redaction: RedactionContext },
): DiagnoseRenderResult {
  const markers = options.ascii === true ? ASCII_MARKERS : UNICODE_MARKERS;
  const idWidth = report.results.reduce((max, r) => Math.max(max, r.checkId.length), 0);
  const lines: string[] = [];
  for (const r of report.results) {
    const marker = markers[r.status];
    const latency = r.latencyMs !== undefined ? ` (${String(r.latencyMs)}ms)` : "";
    const padded = r.checkId.padEnd(idWidth, " ");
    lines.push(`${marker} ${padded}  ${r.detail}${latency}`);
    if (options.verbose === true) {
      if (r.suggestedAction !== null) {
        lines.push(`    → ${r.suggestedAction}`);
      }
      if (r.evidence !== undefined) {
        lines.push(`    evidence: ${JSON.stringify(r.evidence)}`);
      }
    }
  }
  const { ok, warn, fail, skip } = report.summaryCounts;
  lines.push("");
  lines.push(`Summary: ${String(ok)} ok, ${String(warn)} warn, ${String(fail)} fail, ${String(skip)} skip`);
  lines.push(`Exit code: ${String(exitCodeFor(report))}`);
  const { cleaned, leaks } = applyTripwire(lines.join("\n"), options.redaction);
  return { rendered: cleaned, leaks };
}

/**
 * Render a {@link DiagnosticReport} as a JSON string with stable key
 * ordering so back-to-back runs (with `--frozen-timestamp`) are
 * byte-identical when state is unchanged. Returns the tripwire's `leaks`
 * array alongside the cleaned output so the CLI can surface
 * defense-in-depth saves to `--verbose` / `--debug`.
 *
 * Always pipes through the global tripwire — any unexpected secret
 * in `detail` is scrubbed before serialization reaches stdout.
 */
export function formatDiagnoseJson(
  report: DiagnosticReport,
  options: { redaction: RedactionContext },
): DiagnoseRenderResult {
  const sorted = sortKeysDeep(report);
  const { cleaned, leaks } = applyTripwire(JSON.stringify(sorted, null, 2), options.redaction);
  return { rendered: cleaned, leaks };
}

/**
 * Recursively sort object keys for stable serialization. Arrays are
 * preserved in input order. Primitives pass through untouched.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = sortKeysDeep(obj[key]);
    }
    return result;
  }
  return value;
}

/**
 * Compute the process exit code from a report per ADR-DIAG-7:
 *
 * - `1` — any check `fail`
 * - `2` — any check `warn` but no `fail`
 * - `0` — all `ok` or `skip`
 *
 * `10` (fatal init error) is the CLI's responsibility, not the formatter's
 * — by the time we have a `DiagnosticReport`, init has succeeded.
 */
export function exitCodeFor(report: DiagnosticReport): 0 | 1 | 2 {
  if (report.summaryCounts.fail > 0) return 1;
  if (report.summaryCounts.warn > 0) return 2;
  return 0;
}
