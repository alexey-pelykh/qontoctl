#!/usr/bin/env node

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Validates that pnpm-specific protocol specifiers (catalog:, workspace:, link:, file:)
 * are properly resolved in packed publish manifests.
 *
 * Runs `pnpm pack` for each non-private workspace package, extracts the tarball,
 * and checks the published package.json for unresolved protocol specifiers.
 *
 * Exit codes:
 *   0 — all publish manifests have resolved specifiers
 *   1 — one or more manifests contain unresolved protocol specifiers
 */

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const UNRESOLVED_PROTOCOLS = ["catalog:", "workspace:", "link:", "file:"];
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

// Discover non-private workspace packages
const workspaceList = JSON.parse(execSync("pnpm -r ls --json --depth -1", { encoding: "utf-8" }));
const packages = workspaceList.filter((pkg) => !pkg.private);

if (packages.length === 0) {
  console.log("No publishable packages found.");
  process.exit(0);
}

const tempDir = mkdtempSync(join(tmpdir(), "publish-manifest-check-"));
const violations = [];

try {
  for (const pkg of packages) {
    // pnpm pack outputs verbose listing to stdout; find the tarball by scanning the directory
    const before = new Set(readdirSync(tempDir));
    execSync(`pnpm pack --pack-destination ${JSON.stringify(tempDir)}`, {
      cwd: pkg.path,
      stdio: ["ignore", "ignore", "inherit"],
    });
    const after = readdirSync(tempDir);
    const tarball = after.find((f) => f.endsWith(".tgz") && !before.has(f));
    if (!tarball) {
      console.error(`Failed to find tarball for ${pkg.name}`);
      process.exit(1);
    }
    const tarballPath = join(tempDir, tarball);

    // Extract only package/package.json from the tarball
    execSync(`tar -xzf ${JSON.stringify(tarballPath)} -C ${JSON.stringify(tempDir)} package/package.json`);

    const manifest = JSON.parse(readFileSync(join(tempDir, "package", "package.json"), "utf-8"));

    for (const field of DEP_FIELDS) {
      const deps = manifest[field];
      if (!deps) continue;
      for (const [dep, specifier] of Object.entries(deps)) {
        for (const protocol of UNRESOLVED_PROTOCOLS) {
          if (typeof specifier === "string" && specifier.startsWith(protocol)) {
            violations.push({ package: pkg.name, field, dep, specifier });
          }
        }
      }
    }

    // Clean up extracted package and tarball
    rmSync(join(tempDir, "package"), { recursive: true, force: true });
    rmSync(tarballPath, { force: true });
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

if (violations.length > 0) {
  console.error("Publish manifest check FAILED.\n");
  console.error("The following dependencies contain unresolved protocol specifiers:\n");
  for (const v of violations) {
    console.error(`  ${v.package} → ${v.field}.${v.dep}: ${v.specifier}`);
  }
  console.error("\npnpm should resolve these during pack/publish. Possible causes:");
  console.error("  - Missing catalog entry in pnpm-workspace.yaml");
  console.error("  - Using npm publish instead of pnpm publish");
  process.exit(1);
} else {
  console.log(`Publish manifest check passed: ${packages.length} packages verified.`);
  console.log(`Packages: ${packages.map((p) => p.name).join(", ")}`);
}
