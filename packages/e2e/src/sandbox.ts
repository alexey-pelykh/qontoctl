// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

/**
 * Absolute path to the repo-root `.qontoctl.yaml`, computed once from this
 * module's own location. Used to inject `QONTOCTL_CONFIG_FILE` into spawned
 * CLI subprocesses so they hit the repo's config file without relying on
 * CWD inspection (which the resolver no longer does, post #479).
 *
 * The walk-up helpers below (`findConfigDir`, `cliCwd`, the loop in
 * `readConfigFileCredentials`) remain in place for in-process credential
 * detection used by `hasApiKeyCredentials()`/`hasOAuthCredentials()`/
 * `hasStagingToken()` — those parse YAML directly and don't go through the
 * resolver. The full walk-up removal is scoped to #481.
 */
const REPO_ROOT_CONFIG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".qontoctl.yaml");

interface ConfigCredentials {
  readonly organizationSlug?: string;
  readonly secretKey?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly stagingToken?: string;
}

/**
 * Read credentials from `.qontoctl.yaml`, searching from the
 * working directory up to the filesystem root. Returns `undefined` if
 * no config file with credentials is found.
 */
function readConfigFileCredentials(): ConfigCredentials | undefined {
  let dir = process.cwd();
  for (;;) {
    const result = tryReadConfigFile(join(dir, ".qontoctl.yaml"));
    if (result !== undefined) {
      return result;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function tryReadConfigFile(path: string): ConfigCredentials | undefined {
  try {
    const content = readFileSync(path, "utf-8");
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
      }
    }

    return hasAnyCreds ? result : undefined;
  } catch {
    // File not found or unreadable
  }
  return undefined;
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
 * Find the directory containing `.qontoctl.yaml` by walking upward
 * from CWD. Returns `undefined` if no config file is found.
 */
function findConfigDir(): string | undefined {
  let dir = process.cwd();
  for (;;) {
    try {
      readFileSync(join(dir, ".qontoctl.yaml"), "utf-8");
      return dir;
    } catch {
      // not found, try parent
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Build an environment for spawning CLI child processes.
 *
 * Injects `QONTOCTL_CONFIG_FILE=<repo-root>/.qontoctl.yaml` so the CLI
 * loads the repo's config file without relying on CWD inspection (which
 * the resolver no longer performs, post #479). Existing env values for
 * the variable are preserved — tests that explicitly set
 * `QONTOCTL_CONFIG_FILE` keep their override.
 *
 * Existing api-key / oauth env vars (`QONTOCTL_ORGANIZATION_SLUG`, etc.)
 * also continue to take precedence over file values via the env-overlay,
 * so suites that rely on env-only credentials are unaffected.
 */
export function cliEnv(): Record<string, string> {
  const env = { ...(process.env as Record<string, string>) };
  if (env["QONTOCTL_CONFIG_FILE"] === undefined || env["QONTOCTL_CONFIG_FILE"] === "") {
    env["QONTOCTL_CONFIG_FILE"] = REPO_ROOT_CONFIG_PATH;
  }
  return env;
}

/**
 * Return the CWD to use for CLI child processes so they can
 * discover `.qontoctl.yaml` via the config loader. Falls back
 * to the current CWD when no config file is found in parent dirs.
 */
export function cliCwd(): string {
  return findConfigDir() ?? process.cwd();
}
