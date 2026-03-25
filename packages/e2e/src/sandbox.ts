// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";

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
 * Check whether Qonto API credentials are available — either via
 * environment variables or via `.qontoctl.yaml` in the working directory.
 *
 * Used by `describe.skipIf(!hasCredentials())` guards in E2E tests so
 * that API-dependent suites are skipped when no credentials are present.
 */
export function hasCredentials(): boolean {
  if (process.env["QONTOCTL_ORGANIZATION_SLUG"] !== undefined && process.env["QONTOCTL_SECRET_KEY"] !== undefined) {
    return true;
  }
  if (process.env["QONTOCTL_CLIENT_ID"] !== undefined && process.env["QONTOCTL_CLIENT_SECRET"] !== undefined) {
    return true;
  }
  return readConfigFileCredentials() !== undefined;
}

/**
 * Retrieve credentials from environment variables or `.qontoctl.yaml`.
 * Throws if no credentials are available (callers should be guarded by
 * `hasCredentials()`).
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
 * Passes through the current process environment as-is.
 */
export function cliEnv(): Record<string, string> {
  return { ...(process.env as Record<string, string>) };
}

/**
 * Return the CWD to use for CLI child processes so they can
 * discover `.qontoctl.yaml` via the config loader. Falls back
 * to the current CWD when no config file is found in parent dirs.
 */
export function cliCwd(): string {
  return findConfigDir() ?? process.cwd();
}
