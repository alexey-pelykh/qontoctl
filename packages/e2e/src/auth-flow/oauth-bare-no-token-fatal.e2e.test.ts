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

// AC-2 (#631 PR2 arm 1, regression guard for R3): Given a config carrying both
// OAuth client credentials (no access token) AND api-key credentials, but the
// resolved preference is bare `oauth` (NOT `oauth-first`), when any qontoctl
// command is run, then the OAuth chain raises OAuthNoTokenError pre-fetch, the
// http-client has NO fallback authorization wired (bare-mode contract), the
// dedicated OAuthNoTokenError handler emits the auth-login guidance, and the
// command exits non-zero. Critically, the misleading "Verify your API key
// credentials" line MUST NOT appear (that line comes from the generic AuthError
// handler — surfacing it on a bare-oauth failure would falsely suggest the user
// fix their api-key when the actual problem is OAuth-side).
//
// Structural test — no real network needed. The OAuthNoTokenError throws
// before any HTTP request, so the test runs without `hasOAuthCredentials()` or
// `hasApiKeyCredentials()` gates.
describe("auth-flow: oauth bare + no OAuth token → fatal (no fallback) (#631 arm 1)", () => {
  let homeDir: string;
  let configPath: string;

  beforeAll(() => {
    homeDir = mkdtempSync(join(tmpdir(), "qontoctl-oauth-bare-fatal-e2e-"));
    configPath = join(homeDir, ".qontoctl.yaml");

    // Both api-key and OAuth (no token) are configured. The bare `oauth`
    // preference must NOT engage the api-key fallback — proving that the
    // fallback-gate widening in #631 PR2 only fires for *-first modes.
    writeFileSync(
      configPath,
      [
        "api-key:",
        "  organization-slug: fake-slug",
        "  secret-key: fake-secret-key-that-would-fail-anyway",
        "oauth:",
        "  client-id: fake-client-id",
        "  client-secret: fake-client-secret",
      ].join("\n") + "\n",
      { mode: 0o600 },
    );
  });

  afterAll(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("emits OAuthNoTokenError guidance, exits non-zero, NO 'Verify your API key credentials' line", () => {
    const env: Record<string, string> = {
      PATH: process.env["PATH"] ?? "",
      HOME: homeDir,
      USERPROFILE: homeDir,
      QONTOCTL_CONFIG_FILE: configPath,
      QONTOCTL_AUTH: "oauth",
    };

    const { stderr, exitCode } = runCli(["org", "show"], env);

    // AC-2: fatal exit
    expect(exitCode).not.toBe(0);

    // AC-4: OAuth-side guidance present
    expect(stderr).toContain("Authentication error");
    expect(stderr).toContain("No OAuth access token");
    expect(stderr).toContain("qontoctl auth login");

    // AC-4: api-key escape-hatch hint surfaced (does NOT direct the user to
    // verify their api-key credentials, which is the generic-AuthError line).
    expect(stderr).toMatch(/--auth api-key/);

    // Critical AC-4 + R3 regression assertion: the generic AuthError's
    // misleading "Verify your API key credentials" secondary line MUST NOT
    // appear — the dedicated OAuthNoTokenError handler runs first.
    expect(stderr).not.toContain("Verify your API key credentials");

    // R3 regression guard (oauth bare wires no fallback even when api-key is
    // configured): the fallback warning MUST NOT appear on stderr (would prove
    // the http-client incorrectly engaged the api-key fallback under bare oauth).
    expect(stderr).not.toContain("primary authentication failed, falling back to api-key");
  });
});
