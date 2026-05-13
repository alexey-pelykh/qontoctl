// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { afterAll, beforeAll } from "vitest";
import type { AuthPreference } from "@qontoctl/core";

const REPO_ROOT_CONFIG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".qontoctl.yaml");

/**
 * Return the absolute path to the repo-root `.qontoctl.yaml`. Computed once
 * at module load via `import.meta.url`, so it is independent of process CWD.
 *
 * Used both for in-process credential detection (`hasApiKeyCredentials()` /
 * `hasOAuthCredentials()` / `hasStagingToken()` / `getCredentials()`) and for
 * `cliEnv()` to inject `QONTOCTL_CONFIG_FILE` into spawned CLI subprocesses,
 * so the harness no longer relies on CWD-walking heuristics (the resolver
 * dropped CWD discovery in #479).
 */
export function cliConfigPath(): string {
  return REPO_ROOT_CONFIG_PATH;
}

interface ConfigCredentials {
  readonly organizationSlug?: string;
  readonly secretKey?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly stagingToken?: string;
  readonly refreshToken?: string;
}

/**
 * Read credentials from the repo-root `.qontoctl.yaml`. Returns `undefined`
 * if the file is absent, unreadable, or contains no recognized credentials.
 */
function readConfigFileCredentials(): ConfigCredentials | undefined {
  try {
    const content = readFileSync(REPO_ROOT_CONFIG_PATH, "utf-8");
    const parsed: unknown = parseYaml(content);
    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }

    const topLevel = parsed as Record<string, unknown>;
    const result: ConfigCredentials = {};
    let hasAnyCreds = false;

    if ("api-key" in topLevel) {
      const apiKey = topLevel["api-key"];
      if (typeof apiKey === "object" && apiKey !== null) {
        const record = apiKey as Record<string, unknown>;
        const slug = record["organization-slug"];
        const key = record["secret-key"];
        if (typeof slug === "string") {
          (result as { organizationSlug: string }).organizationSlug = slug;
          hasAnyCreds = true;
        }
        if (typeof key === "string") {
          (result as { secretKey: string }).secretKey = key;
          hasAnyCreds = true;
        }
      }
    }

    if ("oauth" in topLevel) {
      const oauth = topLevel["oauth"];
      if (typeof oauth === "object" && oauth !== null) {
        const record = oauth as Record<string, unknown>;
        const clientId = record["client-id"];
        const clientSecret = record["client-secret"];
        if (typeof clientId === "string") {
          (result as { clientId: string }).clientId = clientId;
          hasAnyCreds = true;
        }
        if (typeof clientSecret === "string") {
          (result as { clientSecret: string }).clientSecret = clientSecret;
          hasAnyCreds = true;
        }
        if (typeof record["staging-token"] === "string") {
          (result as { stagingToken: string }).stagingToken = record["staging-token"];
        }
        if (typeof record["refresh-token"] === "string") {
          (result as { refreshToken: string }).refreshToken = record["refresh-token"];
        }
      }
    }

    return hasAnyCreds ? result : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check whether Qonto **api-key** credentials (organization slug +
 * secret key) are available — via `QONTOCTL_ORGANIZATION_SLUG` +
 * `QONTOCTL_SECRET_KEY` env vars or via `api-key.organization-slug`
 * + `api-key.secret-key` in `.qontoctl.yaml`.
 *
 * Used by `describe.skipIf(!hasApiKeyCredentials())` guards on suites
 * whose exercised endpoints work with api-key auth per the
 * [Qonto auth table](https://docs.qonto.com/get-started/business-api/authentication/introduction).
 * Such suites run in CI (which is api-key-only) and locally.
 */
export function hasApiKeyCredentials(): boolean {
  // Use truthy check rather than `!== undefined`: in GitHub Actions, an
  // unconfigured `${{ secrets.X }}` materializes as an empty-string env var,
  // which would falsely indicate creds are present.
  if (process.env["QONTOCTL_ORGANIZATION_SLUG"] && process.env["QONTOCTL_SECRET_KEY"]) {
    return true;
  }
  const fileCreds = readConfigFileCredentials();
  return fileCreds !== undefined && Boolean(fileCreds.organizationSlug) && Boolean(fileCreds.secretKey);
}

/**
 * Check whether Qonto **OAuth** credentials (client id + client secret)
 * are available — via `QONTOCTL_CLIENT_ID` + `QONTOCTL_CLIENT_SECRET`
 * env vars or via `oauth.client-id` + `oauth.client-secret` in
 * `.qontoctl.yaml`.
 *
 * Used by `describe.skipIf(!hasOAuthCredentials())` guards on suites
 * whose endpoints require OAuth per the
 * [Qonto auth table](https://docs.qonto.com/get-started/business-api/authentication/introduction)
 * (international transfers, cards, teams, webhooks, e-invoicing,
 * payment links, insurance, recurring transfers, bulk transfers,
 * quotes, SCA flows, …). These suites only run locally where OAuth
 * is configured; CI is api-key-only and skips them naturally.
 */
export function hasOAuthCredentials(): boolean {
  if (process.env["QONTOCTL_CLIENT_ID"] && process.env["QONTOCTL_CLIENT_SECRET"]) {
    return true;
  }
  const fileCreds = readConfigFileCredentials();
  return fileCreds !== undefined && Boolean(fileCreds.clientId) && Boolean(fileCreds.clientSecret);
}

/**
 * Check whether a Qonto sandbox staging token is configured — either via
 * `QONTOCTL_STAGING_TOKEN` env var or via `oauth.staging-token` in
 * `.qontoctl.yaml`.
 *
 * Used by `describe.skipIf(!hasStagingToken())` guards in E2E tests for
 * sandbox-only behavior (e.g., `mockScaDecision` is only available in the
 * Qonto sandbox environment). Pair with `!hasOAuthCredentials()` since
 * the sandbox is OAuth-only.
 */
export function hasStagingToken(): boolean {
  if (process.env["QONTOCTL_STAGING_TOKEN"]) {
    return true;
  }
  return Boolean(readConfigFileCredentials()?.stagingToken);
}

/**
 * Check whether `QONTOCTL_TRANSFER_PROOF_ID` is set — a known-good
 * production-org SEPA transfer UUID whose proof PDF the test harness
 * may fetch.
 *
 * Used by `describe.skipIf(!hasTransferProofId())` guards on the
 * `transfer proof` / `transfer_proof` E2E suites (#565). The Qonto
 * sandbox simulator does NOT generate proof PDFs — `GET /v2/sepa/
 * transfers/{id}/proof` returns `404 not_found` for ALL settled
 * sandbox transfers (empirical re-probe 2026-05-13, refresh of the
 * 2026-05-12 probe in #565). Coverage therefore requires routing the
 * test against a production org with a dedicated, known-settled
 * transfer whose proof has been generated post-settlement.
 *
 * This gate is opt-in: CI never sets `QONTOCTL_TRANSFER_PROOF_ID`, so
 * proof tests skip in CI; local devs opt in by exporting the env var
 * with a real production transfer UUID. The dev is responsible for
 * routing to production (i.e., not configuring a staging token in the
 * same shell), since a sandbox-routed request will 404 deterministically.
 */
export function hasTransferProofId(): boolean {
  return Boolean(process.env["QONTOCTL_TRANSFER_PROOF_ID"]);
}

/**
 * Return the production-org transfer UUID from
 * `QONTOCTL_TRANSFER_PROOF_ID`. Throws if unset — callers must guard
 * with `hasTransferProofId()`.
 */
export function getTransferProofId(): string {
  const id = process.env["QONTOCTL_TRANSFER_PROOF_ID"];
  if (!id) {
    throw new Error("QONTOCTL_TRANSFER_PROOF_ID is not set (guard with hasTransferProofId())");
  }
  return id;
}

/**
 * Check whether a sandbox OAuth refresh token is available for the
 * OAuth-flow round-trip E2E suite — either via the
 * `QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG` env var (a dedicated test seed
 * surface, kept distinct from runtime refresh-token env vars per #495) or
 * via `oauth.refresh-token` in `.qontoctl.yaml` (local developer flow,
 * populated by `qontoctl auth login`).
 *
 * Used by `describe.skipIf(... || !hasE2ERefreshToken())` on the
 * OAuth-flow E2E suite. Pair with `!hasOAuthCredentials()` and
 * `!hasStagingToken()` since the flow requires sandbox routing and
 * client credentials in addition to the seed refresh token.
 *
 * The suite is **local-only by design**: Qonto rotates refresh tokens on
 * every `oauth/token` exchange (per RFC 6749 §6), so CI-seeded secrets
 * burn on every run. See [`docs/oauth-flow-e2e.md`](../../../docs/oauth-flow-e2e.md)
 * for the rationale and the local rotation workflow.
 */
export function hasE2ERefreshToken(): boolean {
  if (process.env["QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG"]) {
    return true;
  }
  return Boolean(readConfigFileCredentials()?.refreshToken);
}

/**
 * Retrieve the sandbox OAuth refresh token for the OAuth-flow round-trip
 * E2E suite. Resolution order: `QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG`
 * env var, then `oauth.refresh-token` in `.qontoctl.yaml`.
 *
 * Throws if no refresh token is available — callers should be guarded by
 * {@link hasE2ERefreshToken}.
 */
export function getE2ERefreshToken(): string {
  const envToken = process.env["QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG"];
  if (envToken) {
    return envToken;
  }
  const fileToken = readConfigFileCredentials()?.refreshToken;
  if (fileToken) {
    return fileToken;
  }
  throw new Error(
    "No E2E OAuth refresh token available " +
      "(checked QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG env var and oauth.refresh-token in .qontoctl.yaml)",
  );
}

/**
 * Retrieve credentials from environment variables or `.qontoctl.yaml`.
 * Throws if no credentials are available (callers should be guarded by
 * `hasApiKeyCredentials()` or `hasOAuthCredentials()` as appropriate).
 */
export function getCredentials(): ConfigCredentials {
  const envSlug = process.env["QONTOCTL_ORGANIZATION_SLUG"];
  const envKey = process.env["QONTOCTL_SECRET_KEY"];
  const envClientId = process.env["QONTOCTL_CLIENT_ID"];
  const envClientSecret = process.env["QONTOCTL_CLIENT_SECRET"];
  const envStagingToken = process.env["QONTOCTL_STAGING_TOKEN"];

  if (envSlug !== undefined || envKey !== undefined || envClientId !== undefined || envClientSecret !== undefined) {
    return {
      ...(envSlug !== undefined ? { organizationSlug: envSlug } : {}),
      ...(envKey !== undefined ? { secretKey: envKey } : {}),
      ...(envClientId !== undefined ? { clientId: envClientId } : {}),
      ...(envClientSecret !== undefined ? { clientSecret: envClientSecret } : {}),
      ...(envStagingToken !== undefined ? { stagingToken: envStagingToken } : {}),
    };
  }

  const fileCreds = readConfigFileCredentials();
  if (fileCreds !== undefined) {
    return fileCreds;
  }

  throw new Error("No Qonto credentials available (checked env vars and .qontoctl.yaml)");
}

/**
 * Build an environment for spawning CLI child processes.
 *
 * Injects:
 *
 * 1. `QONTOCTL_CONFIG_FILE=<repo-root>/.qontoctl.yaml` so the CLI loads the
 *    repo's config file without relying on CWD inspection (which the resolver
 *    no longer performs, post #479).
 * 2. `QONTOCTL_AUTH` — defaults to **`"api-key"`** so api-key-only
 *    suites stay deterministic between local (where OAuth is also configured)
 *    and CI (which has only api-key creds). Without this pin, a local run with
 *    OAuth in `.qontoctl.yaml` would default to `oauth-first` and exercise a
 *    different code path than CI's api-key-only run — the exact determinism
 *    gap that bit during #463 (see #523 for context).
 *
 *    OAuth-required suites (those gated on `hasOAuthCredentials()`) MUST opt
 *    out via `cliEnv({ authPreference: "oauth-first" })` so their endpoints
 *    actually authenticate against OAuth. The default is api-key because
 *    most suites are api-key-compatible; only the OAuth-required minority
 *    explicitly overrides.
 *
 * Existing env values for these variables are preserved — tests that
 * explicitly set `QONTOCTL_CONFIG_FILE` or `QONTOCTL_AUTH` (e.g. via
 * the spawning shell) keep their override.
 *
 * Existing api-key / oauth env vars (`QONTOCTL_ORGANIZATION_SLUG`, etc.)
 * also continue to take precedence over file values via the env-overlay,
 * so suites that rely on env-only credentials are unaffected.
 *
 * @param options.authPreference Override the default `api-key` pin. Pass
 *   `"oauth-first"` (or another valid `AuthPreference`) for OAuth-required
 *   suites; pass `undefined` (or omit `options`) to accept the api-key default.
 */
export function cliEnv(options: { authPreference?: AuthPreference } = {}): Record<string, string> {
  const env = { ...(process.env as Record<string, string>) };
  if (env["QONTOCTL_CONFIG_FILE"] === undefined || env["QONTOCTL_CONFIG_FILE"] === "") {
    env["QONTOCTL_CONFIG_FILE"] = cliConfigPath();
  }
  if (env["QONTOCTL_AUTH"] === undefined || env["QONTOCTL_AUTH"] === "") {
    env["QONTOCTL_AUTH"] = options.authPreference ?? "api-key";
  }
  return env;
}

/**
 * Register `beforeAll`/`afterAll` hooks that pin `QONTOCTL_AUTH` for the
 * enclosing describe block by mutating `process.env`.
 *
 * Why this exists: {@link cliEnv} pins api-key by default for CI determinism
 * (per #523). OAuth-required suites — those gated on `hasOAuthCredentials()`
 * — must opt out so their endpoints (cards, quotes, intl-transfers, …)
 * actually authenticate against OAuth. Mutating `process.env` propagates
 * through both the direct `cliEnv()` callers (which read it via
 * `{ ...process.env }`) AND the `cli` / `cliRaw` / `cliJson` helpers in
 * `helpers.ts` (which call `cliEnv()` internally) — so a single hook
 * registration covers every CLI spawn in the describe block, regardless of
 * which helper the test uses.
 *
 * Sequential execution (`pnpm test:e2e --concurrency=1`) ensures the
 * `process.env` mutation does not leak between describe blocks.
 *
 * Usage:
 *
 * ```ts
 * import { pinAuthPreference } from "../sandbox.js";
 *
 * describe.skipIf(!hasOAuthCredentials())("OAuth-required suite", () => {
 *   pinAuthPreference("oauth-first");
 *   // ...
 * });
 * ```
 */
export function pinAuthPreference(pref: AuthPreference): void {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env["QONTOCTL_AUTH"];
    process.env["QONTOCTL_AUTH"] = pref;
  });
  afterAll(() => {
    if (previous === undefined) {
      delete process.env["QONTOCTL_AUTH"];
    } else {
      process.env["QONTOCTL_AUTH"] = previous;
    }
  });
}
