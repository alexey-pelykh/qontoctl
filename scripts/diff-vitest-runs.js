#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Diff two vitest JSON-reporter outputs to detect order-dependent tests
 * (epic #603 §8.3, R-OI-2).
 *
 * Reads two reports (typically a default-order run and a
 * `--sequence.shuffle.files` run) and reports any test whose pass/fail/skip
 * classification differs across runs. Skip-reason text is allowed to differ
 * legitimately (a test may skip with `feature-not-supported: X` in one run
 * and `upstream-skipped: feature-not-supported: X` in another); the
 * pass/fail/skip _membership_ may not change.
 *
 * Usage:
 *   node scripts/diff-vitest-runs.js <run1.json> <run2.json>
 *
 * Exit codes:
 *   0 — no divergence (every test classified identically across both runs)
 *   1 — divergence found (at least one test changed pass/fail/skip)
 *   2 — usage error (missing args, missing files, malformed JSON)
 *
 * See `docs/e2e-testing.md` § Order-independence invariant for remediation
 * guidance.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const [, , run1Path, run2Path] = process.argv;
if (run1Path === undefined || run2Path === undefined) {
  process.stderr.write("Usage: node scripts/diff-vitest-runs.js <run1.json> <run2.json>\n");
  process.exit(2);
}
for (const p of [run1Path, run2Path]) {
  if (!existsSync(p)) {
    process.stderr.write(`Error: ${p} does not exist\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Vitest JSON reporter writes one object containing a `testResults` array.
 * Each entry is a file with an `assertionResults` array; each assertion has
 * a `fullName` and a `status` ("passed" / "failed" / "skipped" / "pending" /
 * "todo"). We collapse skipped/pending/todo into the single bucket "skipped"
 * because vitest's `ctx.skip()` and `it.skip()` and `it.todo()` are
 * semantically equivalent for the order-independence check.
 */
function loadOutcomes(reportPath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(reportPath, "utf-8"));
  } catch (e) {
    process.stderr.write(`Error: failed to parse ${reportPath} as JSON: ${e.message}\n`);
    process.exit(2);
  }
  if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.testResults)) {
    process.stderr.write(`Error: ${reportPath} is not a vitest JSON report (missing testResults[])\n`);
    process.exit(2);
  }

  const outcomes = new Map();
  for (const file of parsed.testResults) {
    if (file === null || typeof file !== "object" || !Array.isArray(file.assertionResults)) continue;
    for (const assertion of file.assertionResults) {
      if (assertion === null || typeof assertion !== "object") continue;
      // Key by file + fullName because the same describe/it text can appear
      // across files (e.g. multiple "creates a client" entries across
      // different domain suites).
      const key = `${String(file.name)}::${String(assertion.fullName)}`;
      const status = normalizeStatus(String(assertion.status));
      outcomes.set(key, status);
    }
  }
  return outcomes;
}

/**
 * Collapse vitest's status taxonomy to the three buckets the
 * order-independence invariant cares about: `passed`, `failed`, `skipped`.
 * `pending` and `todo` map to `skipped` (the test did not execute and did
 * not fail).
 */
function normalizeStatus(s) {
  if (s === "passed" || s === "failed") return s;
  return "skipped";
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

const run1 = loadOutcomes(resolve(run1Path));
const run2 = loadOutcomes(resolve(run2Path));

if (run1.size === 0 && run2.size === 0) {
  process.stderr.write(
    "Error: both reports contain zero test outcomes — vitest probably skipped both runs entirely\n" +
      "       (likely cause: credentials not configured; nothing to compare).\n",
  );
  process.exit(2);
}

const allKeys = new Set([...run1.keys(), ...run2.keys()]);
const divergent = [];
for (const key of allKeys) {
  const s1 = run1.get(key);
  const s2 = run2.get(key);
  if (s1 !== s2) {
    divergent.push({
      key,
      run1: s1 === undefined ? "<absent>" : s1,
      run2: s2 === undefined ? "<absent>" : s2,
    });
  }
}

// Stable ordering: alphabetical by key (so CI runs produce diff-friendly output).
divergent.sort((a, b) => a.key.localeCompare(b.key));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const totalKeys = allKeys.size;
process.stdout.write(`Compared ${String(totalKeys)} test(s) across two runs.\n`);

if (divergent.length === 0) {
  process.stdout.write(`✓ Order-independent: all tests classified identically.\n`);
  process.exit(0);
}

process.stderr.write(`\n✗ Order-independence FAILED: ${String(divergent.length)} test(s) diverged.\n\n`);
for (const d of divergent) {
  process.stderr.write(`  ${d.key}\n`);
  process.stderr.write(`    run 1 (default):  ${d.run1}\n`);
  process.stderr.write(`    run 2 (shuffled): ${d.run2}\n`);
}
process.stderr.write(
  "\nDivergent tests likely depend on state created by earlier tests (in-process\n" +
    "module state, shared Qonto sandbox resources, or implicit ordering of\n" +
    "describe blocks). See `docs/e2e-testing.md` § Order-independence invariant\n" +
    "for the remediation pattern and `docs/designs/e2e-test-reliability.md` §8.3\n" +
    "for the design rationale (epic #603 R-OI-2).\n",
);
process.exit(1);
