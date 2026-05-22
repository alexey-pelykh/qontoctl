// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import { CONFIG_DIR } from "../constants.js";
import { ConfigError } from "./resolve.js";

const CONFIG_FILENAME = ".qontoctl.yaml";
const CONFIG_FILE_ENV = "QONTOCTL_CONFIG_FILE";

export interface LoadResult {
  /** Parsed YAML content, or `undefined` if no file was found. */
  raw: unknown;
  /** Absolute path of the file that was loaded, or `undefined` if none found. */
  path: string | undefined;
}

export interface LoadOptions {
  /**
   * Explicit path to load. Highest-priority resolution input; bypasses env
   * and profile/home defaults entirely.
   */
  path?: string | undefined;
  /** Named profile — derives `~/.qontoctl/{profile}.yaml`. */
  profile?: string | undefined;
  /** Override home directory for resolution (useful for testing). */
  home?: string | undefined;
  /** Override environment variables (useful for testing). */
  env?: Record<string, string | undefined> | undefined;
}

/**
 * Resolves and loads the appropriate config file.
 *
 * Precedence (highest first):
 *   1. `path` option — explicit path
 *   2. `QONTOCTL_CONFIG_FILE` env var
 *   3. `~/.qontoctl/{profile}.yaml` (when `profile` is set)
 *   4. `~/.qontoctl.yaml` (home default)
 *
 * No CWD inspection. Local-config workflows must use `path`, the env var,
 * or a direnv shim that exports the env var.
 */
export async function loadConfigFile(options?: LoadOptions): Promise<LoadResult> {
  const path = resolveConfigFilePath(options);
  return loadFromPath(path);
}

/**
 * Resolves the absolute path that {@link loadConfigFile} would load from.
 *
 * Same precedence as {@link loadConfigFile}, but performs no I/O. Useful
 * for writers that must round-trip the loader's path (preventing load/write
 * divergence) and for first-time-write callers that need to know the
 * destination before any file exists.
 */
export function resolveConfigFilePath(options?: LoadOptions): string {
  if (options?.path !== undefined) {
    return options.path;
  }

  const env = options?.env ?? process.env;
  const envPath = env[CONFIG_FILE_ENV];
  if (envPath !== undefined && envPath !== "") {
    return envPath;
  }

  const home = options?.home ?? homedir();
  if (options?.profile !== undefined) {
    return join(home, CONFIG_DIR, `${options.profile}.yaml`);
  }

  return join(home, CONFIG_FILENAME);
}

async function loadFromPath(path: string): Promise<LoadResult> {
  try {
    const content = await readFile(path, "utf-8");
    let raw: unknown;
    try {
      raw = parseYaml(content);
    } catch (parseError: unknown) {
      const detail = parseError instanceof Error ? parseError.message : String(parseError);
      throw new ConfigError(`Failed to parse YAML at "${path}": ${detail}`, "PARSE");
    }
    return { raw, path };
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      throw error;
    }
    if (isNodeError(error)) {
      if (error.code === "ENOENT") {
        return { raw: undefined, path: undefined };
      }
      if (error.code === "EACCES" || error.code === "EPERM") {
        throw new ConfigError(`Permission denied reading config file "${path}".`, "PERMISSION");
      }
    }
    throw new ConfigError(`Failed to read config file "${path}": ${String(error)}`, "PARSE");
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
