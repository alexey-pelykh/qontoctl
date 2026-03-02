// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { CONFIG_DIR } from "../constants.js";

const CONFIG_FILENAME = ".qontoctl.yaml";
const FILE_MODE = 0o600;

/**
 * OAuth token fields to persist in the config file.
 */
export interface TokenUpdate {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly tokenExpiresAt: string;
}

/**
 * Saves OAuth tokens to the user's config file.
 *
 * Reads the existing YAML file, updates the `oauth` section with new token
 * values, and writes it back. Creates the file and directory if they don't exist.
 * File permissions are set to 0o600 (owner read/write only).
 *
 * @param tokens - The token values to save
 * @param options - Optional profile name and home directory override
 */
export async function saveOAuthTokens(
  tokens: TokenUpdate,
  options?: {
    readonly profile?: string;
    readonly home?: string;
    readonly cwd?: string;
  },
): Promise<void> {
  const path = await resolveConfigPath(options?.profile, options?.home, options?.cwd);

  // Ensure directory exists
  await mkdir(dirname(path), { recursive: true });

  // Read existing content
  let doc: Record<string, unknown> = {};
  try {
    const content = await readFile(path, "utf-8");
    const parsed: unknown = parseYaml(content);
    if (parsed !== null && parsed !== undefined && typeof parsed === "object" && !Array.isArray(parsed)) {
      doc = parsed as Record<string, unknown>;
    }
  } catch (error: unknown) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
    // File doesn't exist yet, start with empty doc
  }

  // Update oauth section
  const existingOAuth =
    typeof doc["oauth"] === "object" && doc["oauth"] !== null && !Array.isArray(doc["oauth"])
      ? (doc["oauth"] as Record<string, unknown>)
      : {};

  doc["oauth"] = {
    ...existingOAuth,
    "access-token": tokens.accessToken,
    "token-expires-at": tokens.tokenExpiresAt,
    ...(tokens.refreshToken !== undefined ? { "refresh-token": tokens.refreshToken } : {}),
  };

  // Write back
  const yaml = stringifyYaml(doc);
  await writeFile(path, yaml, { mode: FILE_MODE });
}

/**
 * Saves OAuth client credentials (client-id and client-secret) to the config file.
 *
 * Reads the existing YAML file, updates the `oauth` section with client
 * credentials, and writes it back. Creates the file and directory if needed.
 */
export async function saveOAuthClientCredentials(
  credentials: { readonly clientId: string; readonly clientSecret: string },
  options?: { readonly profile?: string; readonly home?: string; readonly cwd?: string },
): Promise<void> {
  const path = await resolveConfigPath(options?.profile, options?.home, options?.cwd);

  await mkdir(dirname(path), { recursive: true });

  let doc: Record<string, unknown> = {};
  try {
    const content = await readFile(path, "utf-8");
    const parsed: unknown = parseYaml(content);
    if (parsed !== null && parsed !== undefined && typeof parsed === "object" && !Array.isArray(parsed)) {
      doc = parsed as Record<string, unknown>;
    }
  } catch (error: unknown) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const existingOAuth =
    typeof doc["oauth"] === "object" && doc["oauth"] !== null && !Array.isArray(doc["oauth"])
      ? (doc["oauth"] as Record<string, unknown>)
      : {};

  doc["oauth"] = {
    ...existingOAuth,
    "client-id": credentials.clientId,
    "client-secret": credentials.clientSecret,
  };

  const yaml = stringifyYaml(doc);
  await writeFile(path, yaml, { mode: FILE_MODE });
}

/**
 * Clears OAuth tokens from the user's config file.
 *
 * Removes `access-token`, `refresh-token`, and `token-expires-at` from the
 * `oauth` section, preserving `client-id` and `client-secret`.
 */
export async function clearOAuthTokens(options?: {
  readonly profile?: string;
  readonly home?: string;
  readonly cwd?: string;
}): Promise<void> {
  const path = await resolveConfigPath(options?.profile, options?.home, options?.cwd);

  let doc: Record<string, unknown>;
  try {
    const content = await readFile(path, "utf-8");
    const parsed: unknown = parseYaml(content);
    if (parsed === null || parsed === undefined || typeof parsed !== "object" || Array.isArray(parsed)) {
      return; // Nothing to clear
    }
    doc = parsed as Record<string, unknown>;
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return; // Nothing to clear
    }
    throw error;
  }

  if (typeof doc["oauth"] !== "object" || doc["oauth"] === null || Array.isArray(doc["oauth"])) {
    return; // No oauth section to clear
  }

  const oauth = doc["oauth"] as Record<string, unknown>;
  delete oauth["access-token"];
  delete oauth["refresh-token"];
  delete oauth["token-expires-at"];

  const yaml = stringifyYaml(doc);
  await writeFile(path, yaml, { mode: FILE_MODE });
}

/**
 * Resolves the config file path for writing, mirroring the loader's resolution:
 *   - With `profile`: `~/.qontoctl/{profile}.yaml`
 *   - Without `profile`: CWD `.qontoctl.yaml` if it exists, otherwise `~/.qontoctl.yaml`
 */
async function resolveConfigPath(
  profile: string | undefined,
  home: string | undefined,
  cwd: string | undefined,
): Promise<string> {
  const homeDir = home ?? homedir();
  if (profile !== undefined) {
    return join(homeDir, CONFIG_DIR, `${profile}.yaml`);
  }

  // Mirror the loader: prefer CWD config if it exists
  const cwdPath = join(cwd ?? process.cwd(), CONFIG_FILENAME);
  try {
    await access(cwdPath);
    return cwdPath;
  } catch {
    return join(homeDir, CONFIG_FILENAME);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
