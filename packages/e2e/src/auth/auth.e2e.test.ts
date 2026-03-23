// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

/**
 * Build a subprocess env with HOME (and USERPROFILE on Windows) pointing
 * to the given directory so the CLI reads/writes profiles there.
 */
function homeEnv(homeDir: string): Record<string, string> {
  return {
    PATH: process.env["PATH"] ?? "",
    HOME: homeDir,
    USERPROFILE: homeDir,
  };
}

/** Run the CLI synchronously and capture stdout, stderr, and exit code. */
function cli(
  args: string[],
  options?: { env?: Record<string, string> },
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: options?.env,
    timeout: 15_000,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Structural tests — no real credentials needed
// ---------------------------------------------------------------------------

describe("auth commands (e2e)", () => {
  // AC: Given `auth setup --help` is run,
  //     Then help text includes setup guide URL
  describe("auth setup", () => {
    it("--help includes setup guide URL", () => {
      const { stdout, exitCode } = cli(["auth", "setup", "--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("https://github.com/alexey-pelykh/qontoctl/blob/main/docs/oauth-setup.md");
    });
  });

  describe("auth status", () => {
    let statusDir: string;

    beforeAll(() => {
      statusDir = mkdtempSync(join(tmpdir(), "qontoctl-auth-status-e2e-"));
      const dir = join(statusDir, ".qontoctl");
      mkdirSync(dir, { recursive: true });

      // Profile with OAuth client credentials only (no tokens)
      writeFileSync(
        join(dir, "no-tokens.yaml"),
        "oauth:\n  client-id: test-client-id\n  client-secret: test-client-secret\n",
      );

      // Profile with active tokens (far future expiration)
      writeFileSync(
        join(dir, "active.yaml"),
        [
          "oauth:",
          "  client-id: test-client-id",
          "  client-secret: test-client-secret",
          "  access-token: fake-access-token",
          "  refresh-token: fake-refresh-token",
          '  token-expires-at: "2099-01-01T00:00:00.000Z"',
        ].join("\n") + "\n",
      );

      // Profile with expired tokens (no refresh token)
      writeFileSync(
        join(dir, "expired.yaml"),
        [
          "oauth:",
          "  client-id: test-client-id",
          "  client-secret: test-client-secret",
          "  access-token: fake-access-token",
          '  token-expires-at: "2020-01-01T00:00:00.000Z"',
        ].join("\n") + "\n",
      );
    });

    afterAll(() => {
      rmSync(statusDir, { recursive: true, force: true });
    });

    // AC: Given no OAuth config exists (client creds but no tokens),
    //     When `auth status` is run,
    //     Then it shows "Not logged in"
    it("shows 'Not logged in' when no access token exists", () => {
      const { stdout, exitCode } = cli(["auth", "status", "--profile", "no-tokens"], {
        env: homeEnv(statusDir),
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Not logged in");
    });

    // AC: Given a config with OAuth tokens exists,
    //     When `auth status` is run,
    //     Then it displays token status (active), expiration timestamp,
    //     and refresh token availability
    it("displays Active status with expiration for active tokens", () => {
      const { stdout, exitCode } = cli(["auth", "status", "--profile", "active"], {
        env: homeEnv(statusDir),
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Active");
      expect(stdout).toContain("2099-01-01T00:00:00.000Z");
      expect(stdout).toContain("Available");
    });

    // AC: Given a config with expired access token,
    //     When `auth status` is run,
    //     Then it displays Expired status
    it("displays Expired status for expired tokens", () => {
      const { stdout, exitCode } = cli(["auth", "status", "--profile", "expired"], {
        env: homeEnv(statusDir),
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Expired");
      expect(stdout).toContain("2020-01-01T00:00:00.000Z");
      expect(stdout).toContain("Not available");
    });
  });

  // AC: Given no OAuth config exists (no refresh token),
  //     When `auth refresh` is run,
  //     Then it shows a clear error about missing credentials
  describe("auth refresh", () => {
    let refreshDir: string;

    beforeAll(() => {
      refreshDir = mkdtempSync(join(tmpdir(), "qontoctl-auth-refresh-e2e-"));
      const dir = join(refreshDir, ".qontoctl");
      mkdirSync(dir, { recursive: true });

      // Profile with OAuth client credentials and access token but no refresh token
      writeFileSync(
        join(dir, "no-refresh.yaml"),
        [
          "oauth:",
          "  client-id: test-client-id",
          "  client-secret: test-client-secret",
          "  access-token: fake-access-token",
        ].join("\n") + "\n",
      );
    });

    afterAll(() => {
      rmSync(refreshDir, { recursive: true, force: true });
    });

    it("shows error when no refresh token is available", () => {
      const { stderr, exitCode } = cli(["auth", "refresh", "--profile", "no-refresh"], {
        env: homeEnv(refreshDir),
      });
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("No refresh token available");
    });
  });

  // AC: Given a config with OAuth tokens,
  //     When `auth revoke` is run,
  //     Then tokens are cleared from config
  describe("auth revoke", () => {
    let revokeDir: string;

    beforeAll(() => {
      revokeDir = mkdtempSync(join(tmpdir(), "qontoctl-auth-revoke-e2e-"));
      const dir = join(revokeDir, ".qontoctl");
      mkdirSync(dir, { recursive: true });

      // Profile with full OAuth tokens
      writeFileSync(
        join(dir, "revokable.yaml"),
        [
          "oauth:",
          "  client-id: test-client-id",
          "  client-secret: test-client-secret",
          "  access-token: fake-access-token",
          "  refresh-token: fake-refresh-token",
          '  token-expires-at: "2099-01-01T00:00:00.000Z"',
        ].join("\n") + "\n",
      );
    });

    afterAll(() => {
      rmSync(revokeDir, { recursive: true, force: true });
    });

    it("clears tokens from config while preserving client credentials", () => {
      const { stderr, exitCode } = cli(["auth", "revoke", "--profile", "revokable"], {
        env: homeEnv(revokeDir),
      });
      expect(exitCode).toBe(0);
      expect(stderr).toContain("OAuth tokens revoked and cleared");

      // Verify tokens are cleared but client credentials remain
      const content = readFileSync(join(revokeDir, ".qontoctl", "revokable.yaml"), "utf-8");
      expect(content).toContain("client-id");
      expect(content).toContain("client-secret");
      expect(content).not.toContain("access-token");
      expect(content).not.toContain("refresh-token");
      expect(content).not.toContain("token-expires-at");
    });
  });

  // ---------------------------------------------------------------------------
  // Interactive / network-dependent tests — deferred
  // ---------------------------------------------------------------------------
  //
  // The following auth subcommands are not E2E-testable in the current
  // infrastructure and are documented as future work:
  //
  // - `auth setup`: Requires TTY interaction (readline prompts for Client ID
  //   and Client Secret). Could be tested with cliInteractive() if isolated
  //   from real OAuth app registration.
  //
  // - `auth login`: Requires browser interaction for the OAuth authorization
  //   flow (opens browser, waits for callback). Cannot be automated in
  //   headless E2E.
  //
  // - `auth refresh` (with valid refresh token): Requires pre-configured
  //   valid OAuth credentials and a refresh token from a prior login.
  //   The happy path needs a real Qonto OAuth app with valid tokens,
  //   which is not available in the standard E2E test environment.
  //
});
