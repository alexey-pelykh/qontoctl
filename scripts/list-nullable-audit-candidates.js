#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Worklist generator for the L2 strictness audit (issue #604).
 *
 * Greps `packages/core/src/**\/*.ts` (excluding tests) for `.nullable()`
 * occurrences NOT followed by `.optional()`. Each occurrence is a candidate
 * for the per-field decision tree in `docs/designs/e2e-test-reliability.md`
 * § 6.2.
 *
 * The Quote and ClientInvoice schemas are owned by issue #601 and are excluded
 * from this worklist by file path. The list is emitted to
 * `.tmp/l2-audit-worklist.json` as an array of `{file, line, field, schema}`
 * objects (`schema` is best-effort, derived from the closest preceding
 * `export const XxxSchema = z` line).
 *
 * Usage:
 *   node scripts/list-nullable-audit-candidates.js
 *
 * Exit codes:
 *   0 — worklist written successfully
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const CORE_SRC = join(ROOT, "packages", "core", "src");
const OUTPUT = join(ROOT, ".tmp", "l2-audit-worklist.json");

// Files owned by issue #601 — explicitly excluded to avoid overlap.
const EXCLUDED_FILES = new Set([
  "packages/core/src/types/quote.schema.ts",
  "packages/core/src/client-invoices/schemas.ts",
]);

function toPosix(p) {
  return p.split(sep).join("/");
}

function walk(dir, predicate) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      results.push(...walk(full, predicate));
    } else if (entry.isFile() && predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

// Capture the schema currently being defined to attach context to each finding.
// Tracks the most recent `export const XxxSchema = z` declaration that opened
// before the candidate line.
function findEnclosingSchema(lines, lineIndex) {
  const schemaDeclPattern = /^export\s+const\s+(\w+Schema)\s*=/;
  for (let i = lineIndex; i >= 0; i--) {
    const m = schemaDeclPattern.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}

// Extract the field name from a line containing `.nullable()`. The line
// typically looks like `    field_name: z.string().nullable(),`. Returns null
// if no recognizable field-name shape is found (e.g., chained calls or array
// element nullables without an enclosing key).
function extractFieldName(line) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
  return m ? m[1] : null;
}

function main() {
  const files = walk(CORE_SRC, (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"));
  const worklist = [];

  for (const file of files) {
    const rel = toPosix(relative(ROOT, file));
    if (EXCLUDED_FILES.has(rel)) continue;

    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match `.nullable()` not followed by `.optional()`. Skip pure comment lines.
      if (!line.includes(".nullable()")) continue;
      if (line.includes(".nullable().optional()")) continue;
      const trimmed = line.trimStart();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      const field = extractFieldName(line);
      const schema = findEnclosingSchema(lines, i);

      worklist.push({
        file: rel,
        line: i + 1,
        field,
        schema,
        snippet: line.trim(),
      });
    }
  }

  const outDir = dirname(OUTPUT);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(worklist, null, 2) + "\n", "utf-8");

  const fileCounts = worklist.reduce((acc, item) => {
    acc[item.file] = (acc[item.file] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Wrote ${worklist.length} candidates to ${toPosix(relative(ROOT, OUTPUT))}`);
  console.log("\nPer-file breakdown:");
  for (const [file, count] of Object.entries(fileCounts).sort(([, a], [, b]) => b - a)) {
    console.log(`  ${count.toString().padStart(3)} ${file}`);
  }
  console.log(`\nExcluded (owned by #601): ${[...EXCLUDED_FILES].join(", ")}`);
}

main();
