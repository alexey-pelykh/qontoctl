// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import { CONFIG_DIR } from "../constants.js";

const CONFIG_FILENAME = ".qontoctl.yaml";

export interface LoadResult {
  /** Parsed YAML content, or `undefined` if no file was found. */
  raw: unknown;
  /** Path of the file that was loaded, or `undefined` if none found. */
  path: string | undefined;
}

/**
 * Resolves and loads the appropriate config file.
 *
 * - With `profile`: loads `~/.qontoctl/{profile}.yaml`
 * - Without `profile`: tries CWD `.qontoctl.yaml`, then `~/.qontoctl.yaml`
 */
export async function loadConfigFile(options?: {
  profile?: string | undefined;
  cwd?: string | undefined;
  home?: string | undefined;
}): Promise<LoadResult> {
  const home = options?.home ?? homedir();
  const profile = options?.profile;

  if (profile !== undefined) {
    const path = join(home, CONFIG_DIR, `${profile}.yaml`);
    return loadFromPath(path);
  }

  const cwd = options?.cwd ?? process.cwd();

  // Try CWD first
  const cwdPath = join(cwd, CONFIG_FILENAME);
  const cwdResult = await loadFromPath(cwdPath);
  if (cwdResult.raw !== undefined) {
    return cwdResult;
  }

  // Fall back to home directory
  const homePath = join(home, CONFIG_FILENAME);
  return loadFromPath(homePath);
}

async function loadFromPath(path: string): Promise<LoadResult> {
  try {
    const content = await readFile(path, "utf-8");
    const raw: unknown = parseYaml(content);
    return { raw, path };
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { raw: undefined, path: undefined };
    }
    throw new Error(`Failed to read config file "${path}": ${String(error)}`);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
