// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * E2E coverage for the CLI's `--config` flag, `QONTOCTL_CONFIG_FILE` env var,
 * and their precedence rules (issue #480). These run without network: each
 * test points the resolver at an empty YAML file and asserts the resolver
 * surfaces THAT file's path in its `NO_CREDS` error — proof of which file
 * was actually loaded.
 *
 * Resolution precedence under test:
 *   `--config` > `QONTOCTL_CONFIG_FILE` env > `--profile` derived path > `~/.qontoctl.yaml`
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

/**
 * Build a clean subprocess env (no parent QONTOCTL_* leaking through). The
 * E2E harness usually injects QONTOCTL_CONFIG_FILE into the parent env; we
 * deliberately omit it here so the precedence tests start from a known
 * baseline.
 */
function isolatedEnv(homeDir: string, extra?: Record<string, string>): Record<string, string> {
  return {
    PATH: process.env["PATH"] ?? "",
    HOME: homeDir,
    USERPROFILE: homeDir,
    ...extra,
  };
}

function cli(
  args: string[],
  options: { env: Record<string, string>; cwd?: string },
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: options.env,
    cwd: options.cwd,
    timeout: 15_000,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
  };
}

describe("CLI config resolution (--config + QONTOCTL_CONFIG_FILE) (e2e)", () => {
  let scratchDir: string;
  let homeDir: string;
  let configA: string;
  let configB: string;

  beforeAll(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "qontoctl-config-e2e-"));
    homeDir = join(scratchDir, "home");
    mkdirSync(homeDir, { recursive: true });

    // Two distinct empty YAML files — empty so the loader succeeds but the
    // resolver's NO_CREDS branch fires with the explicit path interpolated
    // into the error message ("Explicit path \"X\" was loaded but contains
    // no credentials."). The path in the error is the proof of which file
    // was loaded.
    configA = join(scratchDir, "config-a.yaml");
    configB = join(scratchDir, "config-b.yaml");
    writeFileSync(configA, "{}\n");
    writeFileSync(configB, "{}\n");

    // Profile "work" lives at $HOME/.qontoctl/work.yaml — also empty, so
    // the same NO_CREDS error surfaces with the profile-derived path.
    const profileDir = join(homeDir, ".qontoctl");
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, "work.yaml"), "{}\n");
  });

  afterAll(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  // AC: --config <abs-path> plumbs through to the resolver and selects that file.
  it("--config selects the explicit file (path appears in NO_CREDS error)", () => {
    const { stderr, exitCode } = cli(["--config", configA, "auth", "status"], {
      env: isolatedEnv(homeDir),
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain(configA);
  });

  // AC: QONTOCTL_CONFIG_FILE alone (no --config) selects the env-pointed file.
  it("QONTOCTL_CONFIG_FILE selects the env-pointed file", () => {
    const { stderr, exitCode } = cli(["auth", "status"], {
      env: isolatedEnv(homeDir, { QONTOCTL_CONFIG_FILE: configA }),
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain(configA);
  });

  // AC: --config wins over QONTOCTL_CONFIG_FILE (CLI > env precedence).
  it("--config overrides QONTOCTL_CONFIG_FILE when both are set", () => {
    const { stderr, exitCode } = cli(["--config", configB, "auth", "status"], {
      env: isolatedEnv(homeDir, { QONTOCTL_CONFIG_FILE: configA }),
    });
    expect(exitCode).not.toBe(0);
    // Resolver loaded configB (the --config target), not configA (the env).
    expect(stderr).toContain(configB);
    // Stderr also carries the override warning so the user sees the override.
    expect(stderr).toMatch(/--config.*overrides QONTOCTL_CONFIG_FILE/);
  });

  // AC: --config wins over --profile when paths differ; warning emitted.
  it("--config overrides --profile when paths differ (warns on stderr)", () => {
    const { stderr, exitCode } = cli(["--config", configA, "--profile", "work", "auth", "status"], {
      env: isolatedEnv(homeDir),
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain(configA);
    expect(stderr).toMatch(/--config.*overrides --profile/);
    expect(stderr).toContain("work");
  });

  // AC: --profile alone (no --config, no env) selects ~/.qontoctl/{name}.yaml.
  // The NO_CREDS error message renders the profile-derived path with literal
  // tilde notation (e.g. "~/.qontoctl/work.yaml"), not the expanded absolute
  // path — that's the proof of which resolver branch fired.
  it("--profile alone selects the profile-derived path", () => {
    const { stderr, exitCode } = cli(["--profile", "work", "auth", "status"], {
      env: isolatedEnv(homeDir),
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("~/.qontoctl/work.yaml");
  });

  // CWD-discovery removed by #479 — verify the CLI does NOT load a
  // .qontoctl.yaml in CWD even when one exists there.
  it("does NOT auto-discover config from CWD (#479 contract)", () => {
    const cwdDir = mkdtempSync(join(tmpdir(), "qontoctl-cwd-"));
    try {
      writeFileSync(join(cwdDir, ".qontoctl.yaml"), "api-key:\n  organization-slug: cwd-org\n  secret-key: cwd-key\n");
      // HOME is the populated `homeDir` (with `~/.qontoctl/work.yaml`), but no
      // `--profile` flag is passed and there's no `~/.qontoctl.yaml` at the home
      // root, so resolution falls through to the home default (which is missing).
      // The CWD file is the only credential source available — if CWD discovery
      // were still active, the CLI would succeed; we assert it does NOT.
      const { stderr, exitCode } = cli(["auth", "status"], {
        env: isolatedEnv(homeDir),
        cwd: cwdDir,
      });
      expect(exitCode).not.toBe(0);
      // Error references the home default, not the CWD file.
      expect(stderr).not.toContain(join(cwdDir, ".qontoctl.yaml"));
    } finally {
      rmSync(cwdDir, { recursive: true, force: true });
    }
  });

  // Negative: error message guides the user to --config when nothing is set.
  it("emits actionable error referencing --config when no config source is available", () => {
    const emptyHome = mkdtempSync(join(tmpdir(), "qontoctl-config-empty-"));
    try {
      const { stderr, exitCode } = cli(["auth", "status"], {
        env: isolatedEnv(emptyHome),
      });
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("--config");
    } finally {
      rmSync(emptyHome, { recursive: true, force: true });
    }
  });
});
