// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function runCli(args: readonly string[], env: Record<string, string>): CliResult {
  const result = spawnSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env,
    timeout: 15_000,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
  };
}

// AC-3 (#631 PR2 arm 3): Given a config carrying api-key credentials with an
// EMPTY `secret-key` field AND valid OAuth credentials, and the resolved
// preference is `api-key-first`, when any qontoctl command is run, then the
// CLI exits non-zero with a fatal *Configuration error* and the OAuth fallback
// is NEVER engaged.
//
// Two defensive layers enforce this same invariant (and #631 PR2 adds the
// second one):
//
//   1. `resolveConfig` validation — rejects an empty `secret-key` at
//      config-load time with `Missing required field "secret-key" ...`. This
//      is the layer that fires for a file-config input like this test's.
//   2. `selectAuthChain.fatal` + `createClient`'s fatal-config guard (#631
//      PR2) — defense-in-depth that throws `ConfigError("VALIDATION")` before
//      HTTP-client construction if a present-but-invalid api-key block ever
//      reaches client construction (e.g. via an env overlay path that
//      bypasses layer 1). This layer is unit-tested directly in
//      `packages/cli/src/client.test.ts` (it cannot be reached through a
//      plain file config because layer 1 catches it first).
//
// This E2E test is a black-box check of the AC-3 *user-observable contract*:
// regardless of which layer fires, the explicit `api-key-first` primary choice
// with invalid api-key credentials produces a fatal config error and does NOT
// silently degrade to OAuth. Silent degradation would defeat the
// security-architect invariant from the #631 /council deliberation.
//
// Structural test — no real network. The failure surfaces before any HTTP
// request, so this runs without any credential gates.
describe("auth-flow: api-key-first + empty secret → fatal config error, no OAuth fallback (#631 arm 3)", () => {
  let homeDir: string;
  let configPath: string;

  beforeAll(() => {
    homeDir = mkdtempSync(join(tmpdir(), "qontoctl-api-key-first-fatal-e2e-"));
    configPath = join(homeDir, ".qontoctl.yaml");

    // The api-key block is structurally invalid (empty secret-key). OAuth is
    // also configured (with a far-future access token that would otherwise be
    // a perfectly usable fallback) to prove the fatal failure fires REGARDLESS
    // of whether a working OAuth fallback was available.
    writeFileSync(
      configPath,
      [
        "api-key:",
        "  organization-slug: some-org-slug",
        '  secret-key: ""',
        "oauth:",
        "  client-id: fake-client-id",
        "  client-secret: fake-client-secret",
        "  access-token: fake-access-token",
        '  access-token-expires-at: "2099-01-01T00:00:00.000Z"',
      ].join("\n") + "\n",
      { mode: 0o600 },
    );
  });

  afterAll(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("emits a fatal Configuration error, exits non-zero, OAuth fallback does NOT engage", () => {
    const env: Record<string, string> = {
      PATH: process.env["PATH"] ?? "",
      HOME: homeDir,
      USERPROFILE: homeDir,
      QONTOCTL_CONFIG_FILE: configPath,
      QONTOCTL_AUTH: "api-key-first",
    };

    const { stderr, exitCode } = runCli(["org", "show"], env);

    // AC-3: fatal exit.
    expect(exitCode).not.toBe(0);

    // AC-3: a Configuration error that pinpoints the offending api-key field
    // and carries the "VALIDATION"-code remediation guidance.
    expect(stderr).toContain("Configuration error");
    expect(stderr).toContain("secret-key");
    expect(stderr).toContain("Fix the offending field");

    // AC-3 + security-architect invariant: the OAuth fallback MUST NOT have
    // engaged. The fallback warning, the OAuthNoTokenError guidance, and any
    // HTTP-level error are all absent — proving the failure was fatal at the
    // config layer rather than degrading to an OAuth-authenticated request.
    expect(stderr).not.toContain("primary authentication failed, falling back");
    expect(stderr).not.toContain("No OAuth access token");
    expect(stderr).not.toContain("qontoctl auth login");
    expect(stderr).not.toContain("Qonto API error");
  });
});
