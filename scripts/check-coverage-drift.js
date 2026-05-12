#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Coverage drift detector for E2E tests.
 *
 * Inventories the public surfaces qontoctl ships (MCP tools, CLI command files,
 * core service functions) and cross-references against the coverage manifest at
 * `packages/e2e/coverage.json`. Fails CI when a new surface ships without a
 * manifest entry, when a manifest entry references a surface that no longer
 * exists, when a `covered` entry points to a missing test file, or when an
 * `accepted_gap` entry lacks justification.
 *
 * Usage:
 *   node scripts/check-coverage-drift.js              — validate; exit 1 on drift
 *   node scripts/check-coverage-drift.js --bootstrap  — seed missing entries as `pending`
 *   node scripts/check-coverage-drift.js --prune      — remove stale entries (run with care)
 *
 * Exit codes:
 *   0 — manifest matches inventoried surfaces and references are valid
 *   1 — drift detected (new surfaces, stale entries, broken refs, or missing notes)
 *
 * See CLAUDE.md § Coverage drift policy.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { basename, join, relative, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const MANIFEST_PATH = join(ROOT, "packages", "e2e", "coverage.json");

const VALID_STATUSES = new Set(["covered", "accepted_gap", "pending"]);

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

/**
 * Recursively list files under `dir` whose path satisfies `predicate`. Returns
 * absolute paths.
 */
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

/**
 * Normalize a path to forward slashes regardless of platform, for stable
 * manifest keys.
 */
function toPosix(p) {
  return p.split(sep).join("/");
}

// ---------------------------------------------------------------------------
// Surface inventory
// ---------------------------------------------------------------------------

/**
 * Inventory MCP tools by parsing `server.registerTool("name", ...)` calls in
 * `packages/mcp/src/tools/*.ts` (excluding test files).
 */
function inventoryMcpTools() {
  const toolsDir = join(ROOT, "packages", "mcp", "src", "tools");
  if (!existsSync(toolsDir)) return [];

  const files = walk(toolsDir, (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const surfaces = [];
  const pattern = /server\.registerTool\(\s*"([^"]+)"/g;

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    let match;
    while ((match = pattern.exec(content)) !== null) {
      surfaces.push({
        key: `mcp:${match[1]}`,
        source: toPosix(relative(ROOT, file)),
      });
    }
  }
  return surfaces;
}

/**
 * Inventory CLI commands at the file level. Each `.ts` source file under
 * `packages/cli/src/commands/` is one surface (excluding `index.ts` aggregators
 * and `*.test.ts`). Sub-commands within a file collapse to the file's surface;
 * this is acceptable because the common drift pattern is "new command file"
 * rather than "new sub-command in existing file".
 */
function inventoryCliCommands() {
  const commandsDir = join(ROOT, "packages", "cli", "src", "commands");
  if (!existsSync(commandsDir)) return [];

  const files = walk(commandsDir, (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && basename(f) !== "index.ts");
  return files.map((file) => ({
    key: `cli:${toPosix(relative(ROOT, file))}`,
    source: toPosix(relative(ROOT, file)),
  }));
}

/**
 * Inventory core service functions by parsing `export (async )?function NAME`
 * declarations in `packages/core/src/**\/service.ts` (excluding test files).
 */
function inventoryCoreServiceFunctions() {
  const coreDir = join(ROOT, "packages", "core", "src");
  if (!existsSync(coreDir)) return [];

  const files = walk(coreDir, (f) => {
    if (f.endsWith(".test.ts")) return false;
    const name = basename(f);
    return name === "service.ts" || name.endsWith("-service.ts");
  });
  const surfaces = [];
  const pattern = /^export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/gm;

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const rel = toPosix(relative(ROOT, file));
    let match;
    while ((match = pattern.exec(content)) !== null) {
      surfaces.push({
        key: `core:${rel}#${match[1]}`,
        source: rel,
      });
    }
  }
  return surfaces;
}

/**
 * Aggregate all inventoried surfaces into a Map keyed by surface key.
 */
function inventorySurfaces() {
  const all = [...inventoryMcpTools(), ...inventoryCliCommands(), ...inventoryCoreServiceFunctions()];
  const map = new Map();
  for (const s of all) {
    if (map.has(s.key)) {
      throw new Error(
        `Internal error: duplicate surface key ${s.key} (sources: ${map.get(s.key).source}, ${s.source})`,
      );
    }
    map.set(s.key, s);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Manifest I/O
// ---------------------------------------------------------------------------

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return { surfaces: {} };
  }
  const text = readFileSync(MANIFEST_PATH, "utf-8");
  try {
    const parsed = JSON.parse(text);
    if (parsed.surfaces === undefined || parsed.surfaces === null || typeof parsed.surfaces !== "object") {
      throw new Error("manifest missing `surfaces` object");
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse ${MANIFEST_PATH}: ${err.message}`);
  }
}

function writeManifest(manifest) {
  const sorted = Object.keys(manifest.surfaces)
    .sort()
    .reduce((acc, key) => {
      const entry = manifest.surfaces[key];
      acc[key] = {
        status: entry.status,
        tests: [...entry.tests].sort(),
        notes: entry.notes ?? "",
      };
      return acc;
    }, {});
  const out = { surfaces: sorted };
  writeFileSync(MANIFEST_PATH, JSON.stringify(out, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Compare inventoried surfaces against manifest entries and produce drift
 * findings. Each finding is `{ kind, key, detail }`.
 */
function detectDrift(inventoryMap, manifest) {
  const findings = [];
  const manifestKeys = new Set(Object.keys(manifest.surfaces));
  const inventoryKeys = new Set(inventoryMap.keys());

  // NEW: surface in code but missing from manifest
  for (const key of inventoryKeys) {
    if (!manifestKeys.has(key)) {
      findings.push({
        kind: "NEW",
        key,
        detail: `surface exists in ${inventoryMap.get(key).source} but no manifest entry. Add an entry to packages/e2e/coverage.json with status: covered (with E2E test file) | pending (planned) | accepted_gap (with notes justification).`,
      });
    }
  }

  // STALE: manifest entry references surface no longer in code
  for (const key of manifestKeys) {
    if (!inventoryKeys.has(key)) {
      findings.push({
        kind: "STALE",
        key,
        detail: `manifest references a surface that no longer exists in code. Remove the entry from packages/e2e/coverage.json.`,
      });
    }
  }

  // Per-entry validation
  for (const [key, entry] of Object.entries(manifest.surfaces)) {
    if (!VALID_STATUSES.has(entry.status)) {
      findings.push({
        kind: "INVALID_STATUS",
        key,
        detail: `status is ${JSON.stringify(entry.status)}; expected one of: ${[...VALID_STATUSES].join(", ")}.`,
      });
      continue;
    }
    if (!Array.isArray(entry.tests)) {
      findings.push({
        kind: "INVALID_SHAPE",
        key,
        detail: "tests must be an array of file paths (use [] for non-covered surfaces).",
      });
      continue;
    }

    if (entry.status === "covered") {
      if (entry.tests.length === 0) {
        findings.push({
          kind: "BROKEN_REF",
          key,
          detail:
            "status is `covered` but tests array is empty. Add at least one E2E test file path, or change status to `pending`.",
        });
      } else {
        for (const testPath of entry.tests) {
          const abs = join(ROOT, testPath);
          if (!existsSync(abs)) {
            findings.push({
              kind: "BROKEN_REF",
              key,
              detail: `test file does not exist: ${testPath}`,
            });
          }
        }
      }
    }

    if (entry.status === "accepted_gap") {
      const notes = typeof entry.notes === "string" ? entry.notes.trim() : "";
      if (notes.length === 0) {
        findings.push({
          kind: "MISSING_NOTE",
          key,
          detail:
            "status is `accepted_gap` but notes field is empty. Document why the surface cannot be covered (e.g., Embed-partner-only endpoint).",
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Bootstrap / prune
// ---------------------------------------------------------------------------

function bootstrap(inventoryMap, manifest) {
  let added = 0;
  for (const key of inventoryMap.keys()) {
    if (!Object.prototype.hasOwnProperty.call(manifest.surfaces, key)) {
      manifest.surfaces[key] = { status: "pending", tests: [], notes: "" };
      added++;
    }
  }
  return added;
}

function prune(inventoryMap, manifest) {
  let removed = 0;
  for (const key of Object.keys(manifest.surfaces)) {
    if (!inventoryMap.has(key)) {
      delete manifest.surfaces[key];
      removed++;
    }
  }
  return removed;
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
  const kindOrder = ["NEW", "STALE", "BROKEN_REF", "MISSING_NOTE", "INVALID_STATUS", "INVALID_SHAPE"];
  for (const kind of kindOrder) {
    const items = byKind.get(kind);
    if (!items || items.length === 0) continue;
    process.stderr.write(`\n[${kind}] ${items.length} finding(s):\n`);
    for (const f of items) {
      process.stderr.write(`  - ${f.key}\n    ${f.detail}\n`);
    }
  }
}

function reportSummary(inventoryMap, manifest) {
  const total = inventoryMap.size;
  const stats = { covered: 0, accepted_gap: 0, pending: 0 };
  for (const entry of Object.values(manifest.surfaces)) {
    if (Object.prototype.hasOwnProperty.call(stats, entry.status)) {
      stats[entry.status]++;
    }
  }
  const pct = total > 0 ? ((stats.covered / total) * 100).toFixed(1) : "0.0";
  process.stdout.write(
    `Coverage manifest: ${total} surfaces tracked — ${stats.covered} covered (${pct}%), ${stats.accepted_gap} accepted gaps, ${stats.pending} pending.\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = new Set(process.argv.slice(2));
  const isBootstrap = args.has("--bootstrap");
  const isPrune = args.has("--prune");

  const inventoryMap = inventorySurfaces();
  const manifest = readManifest();

  if (isBootstrap || isPrune) {
    let mutated = false;
    if (isBootstrap) {
      const added = bootstrap(inventoryMap, manifest);
      if (added > 0) {
        process.stdout.write(`Bootstrap: added ${added} surface(s) as pending.\n`);
        mutated = true;
      } else {
        process.stdout.write("Bootstrap: manifest already covers all inventoried surfaces.\n");
      }
    }
    if (isPrune) {
      const removed = prune(inventoryMap, manifest);
      if (removed > 0) {
        process.stdout.write(`Prune: removed ${removed} stale entry(ies).\n`);
        mutated = true;
      } else {
        process.stdout.write("Prune: no stale entries found.\n");
      }
    }
    if (mutated) writeManifest(manifest);
    return;
  }

  const findings = detectDrift(inventoryMap, manifest);
  reportSummary(inventoryMap, manifest);

  if (findings.length > 0) {
    process.stderr.write(`\nCoverage drift check FAILED: ${findings.length} finding(s).\n`);
    reportFindings(findings);
    process.stderr.write(
      "\nResolution paths:\n" +
        "  • New surface? Add an entry to packages/e2e/coverage.json.\n" +
        "  • Renamed/removed surface? Delete the stale entry (or run with --prune).\n" +
        "  • Endpoint genuinely untestable? Mark status: `accepted_gap` with a notes justification.\n" +
        "  • See CLAUDE.md § Coverage drift policy.\n",
    );
    process.exit(1);
  }

  process.stdout.write("Coverage drift check passed.\n");
}

main();
