// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";

interface ApiKeyCredentials {
  readonly organizationSlug: string;
  readonly secretKey: string;
}

/**
 * Read API key credentials from `.qontoctl.yaml`, searching from the
 * working directory up to the filesystem root. Returns `undefined` if
 * no config file with credentials is found.
 */
function readConfigFileCredentials(): ApiKeyCredentials | undefined {
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

function tryReadConfigFile(path: string): ApiKeyCredentials | undefined {
  try {
    const content = readFileSync(path, "utf-8");
    const parsed: unknown = parseYaml(content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "api-key" in parsed
    ) {
      const apiKey = (parsed as Record<string, unknown>)["api-key"];
      if (
        typeof apiKey === "object" &&
        apiKey !== null &&
        "organization_slug" in apiKey &&
        "secret_key" in apiKey
      ) {
        const record = apiKey as Record<string, unknown>;
        const slug = record["organization_slug"];
        const key = record["secret_key"];
        if (typeof slug === "string" && typeof key === "string") {
          return { organizationSlug: slug, secretKey: key };
        }
      }
    }
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
  if (
    process.env["QONTOCTL_ORGANIZATION_SLUG"] !== undefined &&
    process.env["QONTOCTL_SECRET_KEY"] !== undefined
  ) {
    return true;
  }
  return readConfigFileCredentials() !== undefined;
}

/**
 * Retrieve the API key credentials from environment variables or
 * `.qontoctl.yaml`. Throws if no credentials are available (callers
 * should be guarded by `hasCredentials()`).
 */
export function getCredentials(): ApiKeyCredentials {
  const envSlug = process.env["QONTOCTL_ORGANIZATION_SLUG"];
  const envKey = process.env["QONTOCTL_SECRET_KEY"];
  if (envSlug !== undefined && envKey !== undefined) {
    return { organizationSlug: envSlug, secretKey: envKey };
  }

  const fileCreds = readConfigFileCredentials();
  if (fileCreds !== undefined) {
    return fileCreds;
  }

  throw new Error("No Qonto credentials available (checked env vars and .qontoctl.yaml)");
}

/**
 * Build an environment for spawning CLI child processes, ensuring
 * credentials are available via env vars. When credentials come from
 * `.qontoctl.yaml` (not env vars), this injects them so child
 * processes running from a different CWD can resolve them.
 */
export function cliEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };

  if (env["QONTOCTL_ORGANIZATION_SLUG"] === undefined || env["QONTOCTL_SECRET_KEY"] === undefined) {
    const creds = getCredentials();
    env["QONTOCTL_ORGANIZATION_SLUG"] = creds.organizationSlug;
    env["QONTOCTL_SECRET_KEY"] = creds.secretKey;
  }

  return env;
}
