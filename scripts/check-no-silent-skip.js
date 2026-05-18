#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Silent-skip regression guard for E2E tests.
 *
 * Bans the L1 failure-visibility pattern that hid #496 for ~2 weeks (epic
 * #603 / sub-issue #605):
 *
 *   1. `if (result.isError === true) return;` — swallows tool errors so a
 *      schema-parse bug (the #496 class) reports green.
 *   2. `if (X === undefined) return;` in test code — swallows CRUD-chain
 *      cascades and inline empty-fixture cases without surfacing the skip.
 *   3. `if (X.length === 0) return;` in test code — swallows empty-list
 *      missing-fixture cases without surfacing the skip (same disease as
 *      #2, different shape).
 *   4. Empty-reason skips: `it.skip("")`, `ctx.skip("")`,
 *      `describe.skip("")` — visible in the report but with no diagnostic
 *      value (R-SR-1).
 *
 * Visible replacements live in `packages/e2e/src/helpers.ts`:
 * `skipIfToolError`, `skipIfUpstreamSkipped`, `skipMissingFixture`, plus
 * the {@link SkipKind} taxonomy. See `docs/designs/e2e-test-reliability.md`
 * §6.1 for the migration pattern.
 *
 * Usage:
 *   node scripts/check-no-silent-skip.js
 *
 * Exit codes:
 *   0 — no banned patterns found
 *   1 — at least one banned pattern found (CI fails)
 *
 * Output format (mirrors `scripts/check-coverage-drift.js`):
 *   [<KIND>] <count> finding(s):
 *     - <file>:<line>:<column>
 *       <matched line>
 *       <remediation hint>
 *
 * Modeled on `scripts/check-coverage-drift.js` (same walk + report shape,
 * different rule set).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const E2E_SRC = join(ROOT, "packages", "e2e", "src");

// Files exempt from the chained-undefined ban (these define the visible
// alternatives, so they may legitimately reference the banned shape in
// comments or unrelated control flow).
const CHAINED_UNDEFINED_EXEMPT = new Set([join("packages", "e2e", "src", "helpers.ts")]);

// ---------------------------------------------------------------------------
// Banned patterns
// ---------------------------------------------------------------------------

/**
 * Rule descriptors. Each entry produces one finding kind. `pattern` is a
 * RegExp executed per-line (sticky=false, global=false — line scans
 * already iterate). `appliesTo(relPath)` returns true when the rule should
 * be evaluated for that file.
 */
const RULES = [
  {
    kind: "SILENT_TOOL_ERROR",
    // `if (result.isError === true) return;` — any identifier in place of
    // `result`. Captures the canonical silent-tool-error pattern.
    pattern: /if\s*\(\s*[A-Za-z_$][\w$]*\.isError\s*===\s*true\s*\)\s*return\s*;/,
    appliesTo: (rel) => rel.endsWith(".e2e.test.ts"),
    remediation:
      "Replace with `skipIfToolError(result, ctx, kind, detail[, carrier])` (visible skip via vitest's ctx.skip)\n" +
      "      or `expect(result.isError, ...).toBeFalsy()` (when the error is unexpected — the #496 class).\n" +
      "      See `packages/e2e/src/helpers.ts` and `docs/designs/e2e-test-reliability.md` §6.1.",
  },
  {
    kind: "SILENT_CHAINED_UNDEFINED",
    // `if (X === undefined) return;` — silent CRUD-chain or empty-fixture
    // skip. The `\)\s*return` is the distinguishing tail (vs the visible
    // block form `\)\s*\{` followed by ctx.skip(...) and return).
    pattern: /if\s*\(\s*[A-Za-z_$][\w$.[\]"']*\s*===\s*undefined\s*\)\s*return\s*;/,
    appliesTo: (rel) => rel.endsWith(".e2e.test.ts") && !CHAINED_UNDEFINED_EXEMPT.has(rel),
    remediation:
      "Replace with `skipIfUpstreamSkipped(lifecycleSkip, ctx)` (CRUD-chain cascade)\n" +
      "      or `skipMissingFixture(ctx, detail)` (in-test empty fixture)\n" +
      "      — see `packages/e2e/src/helpers.ts`.",
  },
  {
    kind: "SILENT_EMPTY_LIST",
    // `if (X.length === 0) return;` — silent empty-fixture skip on a
    // collection. Same disease as SILENT_CHAINED_UNDEFINED, different
    // shape (the list call succeeded but returned no items).
    pattern: /if\s*\(\s*[A-Za-z_$][\w$.[\]"']*\.length\s*===\s*0\s*\)\s*return\s*;/,
    appliesTo: (rel) => rel.endsWith(".e2e.test.ts"),
    remediation:
      "Replace with `skipMissingFixture(ctx, detail)` — surfaces as a visible\n" +
      "      `missing-fixture: <detail>` skip in the vitest report. See\n" +
      "      `packages/e2e/src/helpers.ts`.",
  },
  {
    kind: "EMPTY_SKIP_REASON",
    // `it.skip("")`, `ctx.skip("")`, `describe.skip("")`, `test.skip("")`,
    // including space-only strings. Whitespace-only counts as empty
    // because it provides zero diagnostic value in the vitest report.
    pattern: /(?:it|test|describe|ctx)\.skip\(\s*(["'`])\s*\1\s*[,)]/,
    appliesTo: (rel) => rel.endsWith(".e2e.test.ts") || rel.endsWith(".ts"),
    remediation:
      "Every skip must carry a non-empty reason (R-SR-1) so the vitest report has diagnostic value.\n" +
      "      Use a `SkipKind` prefix (`feature-not-supported:` / `sandbox-precondition:` / `missing-fixture:`)\n" +
      "      or `upstream-skipped:` for CRUD-chain propagation.",
  },
];

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

/**
 * Recursively list files under `dir`. Returns absolute paths. Skips
 * `node_modules` and `dist` (mirrors `check-coverage-drift.js`).
 */
function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      results.push(...walk(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Normalize a path to forward slashes regardless of platform, for stable
 * report output and exempt-set matching on Windows runners.
 */
function toPosix(p) {
  return p.split(sep).join("/");
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/**
 * Apply every rule to every applicable file. Returns
 * `{ kind, relPath, line, column, text, remediation }` findings.
 */
function scan() {
  if (!existsSync(E2E_SRC)) {
    // No E2E tree — nothing to guard. Treat as clean (the coverage-drift
    // check has the same posture for absent surfaces).
    return [];
  }

  const findings = [];
  const files = walk(E2E_SRC).filter((f) => f.endsWith(".ts"));

  for (const abs of files) {
    const rel = toPosix(relative(ROOT, abs));
    // Compare against the POSIX-normalized exempt entries so the
    // CHAINED_UNDEFINED_EXEMPT membership check works on Windows.
    const relPosix = rel;
    const exemptKey = join(...rel.split("/")); // re-platformize for set lookup
    const applicableRules = RULES.filter((r) => (r.appliesTo === undefined ? true : r.appliesTo(exemptKey)));
    if (applicableRules.length === 0) continue;

    const content = readFileSync(abs, "utf-8");
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip single-line comments (`//` after any leading whitespace).
      // The banned patterns are sometimes referenced verbatim inside
      // explanatory comments (audit trails, migration notes); only
      // executable code should trip the guard. Block comments (`/* */`)
      // are not stripped — they are uncommon for inline rule-shaped text
      // and adding multi-line state would complicate the scanner.
      if (/^\s*\/\//.test(line)) continue;
      for (const rule of applicableRules) {
        const m = rule.pattern.exec(line);
        if (m !== null) {
          findings.push({
            kind: rule.kind,
            relPath: relPosix,
            line: i + 1,
            column: m.index + 1,
            text: line.trim(),
            remediation: rule.remediation,
          });
        }
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function reportFindings(findings) {
  if (findings.length === 0) return;
  const byKind = new Map();
  for (const f of findings) {
    if (!byKind.has(f.kind)) byKind.set(f.kind, []);
    byKind.get(f.kind).push(f);
  }
  // Mirrors check-coverage-drift.js: stable ordering by kind for legibility
  // and grep-friendliness in CI logs.
  const kindOrder = ["SILENT_TOOL_ERROR", "SILENT_CHAINED_UNDEFINED", "SILENT_EMPTY_LIST", "EMPTY_SKIP_REASON"];
  for (const kind of kindOrder) {
    const items = byKind.get(kind);
    if (items === undefined || items.length === 0) continue;
    process.stderr.write(`\n[${kind}] ${String(items.length)} finding(s):\n`);
    // Print remediation once per kind (shared across all findings of that kind).
    const remediation = items[0].remediation;
    for (const f of items) {
      process.stderr.write(`  - ${f.relPath}:${String(f.line)}:${String(f.column)}\n`);
      process.stderr.write(`      ${f.text}\n`);
    }
    process.stderr.write(`    Fix: ${remediation}\n`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const findings = scan();

  if (findings.length === 0) {
    process.stdout.write("Silent-skip check passed.\n");
    return;
  }

  process.stderr.write(`Silent-skip check FAILED: ${String(findings.length)} finding(s).\n`);
  reportFindings(findings);
  process.stderr.write(
    "\nWhy this guard exists:\n" +
      "  The silent-skip pattern conflated 'couldn't execute' (skip), 'executed and\n" +
      "  found a bug' (fail), and 'executed correctly' (pass) into one green dot.\n" +
      "  It hid #496 (Quote/ClientInvoice schema-parse failure) for ~2 weeks. See\n" +
      "  `docs/prds/e2e-test-reliability.md` §1.1 and `docs/designs/e2e-test-reliability.md` §6.1.\n",
  );
  process.exit(1);
}

main();
