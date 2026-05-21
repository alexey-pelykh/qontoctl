// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCredentials, hasApiKeyCredentials, hasStagingToken } from "../sandbox.js";

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
    // 30s (vs 15s in the structural-only auth-flow tests): the `api-key` /
    // `production-only` rows make a real `org show` request over the network.
    timeout: 30_000,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
  };
}

// ---------------------------------------------------------------------------
// AC-5 (#631 PR2, C9 / G5): the credential-state matrix.
//
// Component C9 specifies "4 credential states × 2 preferences = 8 scenarios".
// The 4 states are credential-PRESENCE states; the 2 preferences are the two
// fallback-capable modes (`oauth-first`, `api-key-first`) — the bare `oauth`
// and `api-key` modes have no fallback and are exercised by the dedicated
// AC-2 (`oauth-bare-no-token-fatal`) test and the unit `selectAuthChain`
// matrix in `packages/core/src/auth/preference.test.ts`.
//
// The 4 credential-presence states:
//   - api-key-only    — api-key creds, NO `oauth:` section at all
//   - oauth-no-token  — `oauth:` client creds present, NO access token; no api-key
//   - both            — api-key creds AND `oauth:` client creds (no token)
//   - neither          — empty credential sections, nothing usable
//
//   #  preference     state           outcome           run mode
//   1  oauth-first    api-key-only    success           production-only
//   2  oauth-first    oauth-no-token  fatal-error       structural
//   3  oauth-first    both            fallback-success  api-key (AC-1, AC-6)
//   4  oauth-first    neither         fatal-error       structural
//   5  api-key-first  api-key-only    success           production-only
//   6  api-key-first  oauth-no-token  fatal-error       structural
//   7  api-key-first  both            success           api-key
//   8  api-key-first  neither         fatal-error       structural
//
// Run modes (capability gates, mirroring the project's existing
// `describe.skipIf(...)` pattern):
//
//   - `structural`       — the failure surfaces before any network I/O
//                          (config/auth resolution). Always runs.
//   - `api-key`          — makes a real `org show` request authenticated by
//                          api-key. The config carries an `oauth:` section,
//                          so a sandbox staging token (local dev) attaches
//                          and routes to the sandbox; in CI (no staging
//                          token) it routes to production. Gated on
//                          `hasApiKeyCredentials()` — runs locally and in CI.
//   - `production-only`  — the `api-key-only` success rows. A true
//                          `api-key-only` config has NO `oauth:` section, and
//                          a staging token can only attach to a full `oauth:`
//                          section (see `config/validate.ts` + `config/env.ts`
//                          — the token is "only meaningful with full OAuth
//                          credentials"). So these rows cannot reach the
//                          sandbox; they route to production and require a
//                          production-scoped api-key. Gated on
//                          `hasApiKeyCredentials() && !hasStagingToken()` —
//                          runs in CI (production api-key, no staging token),
//                          skips for local sandbox developers.
// ---------------------------------------------------------------------------

type CredentialState = "api-key-only" | "oauth-no-token" | "both" | "neither";
type Preference = "oauth-first" | "api-key-first";
type RunMode = "structural" | "api-key" | "production-only";

interface MatrixCombo {
  readonly id: number;
  readonly preference: Preference;
  readonly state: CredentialState;
  readonly runMode: RunMode;
  readonly title: string;
  readonly assert: (r: CliResult) => void;
}

/**
 * Build the `.qontoctl.yaml` body for a given credential-presence state.
 * Real api-key credentials are sourced from {@link getCredentials} only for
 * states that require a live request (callers gate on the run mode). When an
 * `oauth:` section is present it carries client credentials but NO access
 * token — the "wired but never logged in" state arm 1 of #631 was failing to
 * fall back from. A sandbox staging token, when available, is appended to the
 * `oauth:` section so the live-request states route to the sandbox.
 */
function buildConfig(state: CredentialState): string {
  switch (state) {
    case "api-key-only": {
      // No `oauth:` section — a true api-key-only config (production routing).
      const creds = getCredentials();
      return (
        [
          "api-key:",
          `  organization-slug: ${creds.organizationSlug ?? ""}`,
          `  secret-key: ${creds.secretKey ?? ""}`,
        ].join("\n") + "\n"
      );
    }
    case "oauth-no-token":
      return (
        ["oauth:", "  client-id: matrix-fake-client-id", "  client-secret: matrix-fake-client-secret"].join("\n") + "\n"
      );
    case "both": {
      const creds = getCredentials();
      const lines = [
        "api-key:",
        `  organization-slug: ${creds.organizationSlug ?? ""}`,
        `  secret-key: ${creds.secretKey ?? ""}`,
        "oauth:",
        "  client-id: matrix-fake-client-id",
        "  client-secret: matrix-fake-client-secret",
      ];
      if (creds.stagingToken !== undefined) {
        // The token attaches to this full `oauth:` section and routes the
        // live request to the Qonto sandbox.
        lines.push(`  staging-token: ${creds.stagingToken}`);
      }
      return lines.join("\n") + "\n";
    }
    case "neither":
      // Empty `api-key:` section → a non-null config that resolves to zero
      // usable credentials (avoids the comment-only → home-fallback path).
      return "# auth-matrix e2e: empty credential section, nothing usable\napi-key:\n";
  }
}

const MATRIX: readonly MatrixCombo[] = [
  {
    id: 1,
    preference: "oauth-first",
    state: "api-key-only",
    runMode: "production-only",
    title: "oauth-first + api-key-only → success via api-key (OAuth absent, degrades)",
    assert: (r) => {
      expect(r.exitCode, `stderr:\n${r.stderr}`).toBe(0);
      expect(r.stdout).toContain("slug");
    },
  },
  {
    id: 2,
    preference: "oauth-first",
    state: "oauth-no-token",
    runMode: "structural",
    title: "oauth-first + oauth-no-token → fatal (no api-key fallback available)",
    assert: (r) => {
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain("No OAuth access token");
      expect(r.stderr).not.toContain("primary authentication failed, falling back");
    },
  },
  {
    id: 3,
    preference: "oauth-first",
    state: "both",
    runMode: "api-key",
    title: "oauth-first + both → fallback-success via api-key + stderr warning (AC-1, AC-6)",
    assert: (r) => {
      // AC-1: the request SUCCEEDS via the api-key fallback.
      expect(r.exitCode, `stderr:\n${r.stderr}\nstdout:\n${r.stdout}`).toBe(0);
      expect(r.stdout).toContain("slug");
      // AC-6: a one-line stderr warning informs the operator of the fallback.
      expect(r.stderr).toContain("primary authentication failed, falling back to api-key");
      expect(r.stderr).toContain("GET");
    },
  },
  {
    id: 4,
    preference: "oauth-first",
    state: "neither",
    runMode: "structural",
    title: "oauth-first + neither → fatal (no credentials)",
    assert: (r) => {
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr.toLowerCase()).toContain("credential");
    },
  },
  {
    id: 5,
    preference: "api-key-first",
    state: "api-key-only",
    runMode: "production-only",
    title: "api-key-first + api-key-only → success via api-key",
    assert: (r) => {
      expect(r.exitCode, `stderr:\n${r.stderr}`).toBe(0);
      expect(r.stdout).toContain("slug");
    },
  },
  {
    id: 6,
    preference: "api-key-first",
    state: "oauth-no-token",
    runMode: "structural",
    title: "api-key-first + oauth-no-token → fatal (api-key absent, degrades to tokenless OAuth)",
    assert: (r) => {
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain("No OAuth access token");
      expect(r.stderr).not.toContain("primary authentication failed, falling back");
    },
  },
  {
    id: 7,
    preference: "api-key-first",
    state: "both",
    runMode: "api-key",
    title: "api-key-first + both → success via api-key (primary, fallback never invoked)",
    assert: (r) => {
      expect(r.exitCode, `stderr:\n${r.stderr}`).toBe(0);
      expect(r.stdout).toContain("slug");
      // api-key is the valid primary — the OAuth fallback must NOT engage.
      expect(r.stderr).not.toContain("primary authentication failed, falling back");
    },
  },
  {
    id: 8,
    preference: "api-key-first",
    state: "neither",
    runMode: "structural",
    title: "api-key-first + neither → fatal (no credentials)",
    assert: (r) => {
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr.toLowerCase()).toContain("credential");
    },
  },
];

/**
 * Resolve whether a combo must be skipped in the current environment, per its
 * {@link RunMode}. `structural` rows always run; `api-key` rows need api-key
 * credentials; `production-only` rows additionally need the absence of a
 * staging token (they cannot reach the sandbox — see the header comment).
 */
function shouldSkip(runMode: RunMode): boolean {
  if (runMode === "structural") return false;
  if (runMode === "api-key") return !hasApiKeyCredentials();
  return !hasApiKeyCredentials() || hasStagingToken();
}

describe("auth-flow: credential-state matrix — 4 states × 2 preferences (#631 AC-5)", () => {
  let homeDir: string;

  beforeAll(() => {
    homeDir = mkdtempSync(join(tmpdir(), "qontoctl-auth-matrix-e2e-"));
  });

  afterAll(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  for (const combo of MATRIX) {
    it.skipIf(shouldSkip(combo.runMode))(`[${String(combo.id)}] ${combo.title}`, () => {
      const configPath = join(homeDir, `combo-${String(combo.id)}.yaml`);
      writeFileSync(configPath, buildConfig(combo.state), { mode: 0o600 });

      const env: Record<string, string> = {
        PATH: process.env["PATH"] ?? "",
        HOME: homeDir,
        USERPROFILE: homeDir,
        QONTOCTL_CONFIG_FILE: configPath,
        QONTOCTL_AUTH: combo.preference,
      };

      combo.assert(runCli(["org", "show"], env));
    });
  }
});
