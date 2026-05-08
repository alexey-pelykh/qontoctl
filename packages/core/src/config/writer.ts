// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import lockfile from "proper-lockfile";
import { resolveConfigFilePath, type LoadOptions } from "./loader.js";
import { ConfigError } from "./resolve.js";

const FILE_MODE = 0o600;

/**
 * Lock retry policy. Bounded — failure surfaces as `CONFLICT` rather than
 * deadlocking. Total wait ~3s in the worst case.
 */
const LOCK_RETRY_OPTIONS = {
  retries: 5,
  factor: 1.5,
  minTimeout: 100,
  maxTimeout: 1000,
} as const;

/**
 * Stale-lock threshold (ms). proper-lockfile considers a lock stale (and
 * eligible for steal) when it hasn't been updated within this window.
 * 10s gives slow disks/snapshots room while preventing crashed processes
 * from holding the lock forever.
 */
const LOCK_STALE_MS = 10_000;

/**
 * OAuth token fields to persist in the config file.
 */
export interface TokenUpdate {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly accessTokenExpiresAt: string;
}

/**
 * Options accepted by all writer entrypoints.
 *
 * - `path` — explicit absolute or relative path. When provided, no
 *   resolution occurs and `profile`/`home` are ignored. Callers performing
 *   write-after-load (e.g., `auth refresh`) should round-trip the `path`
 *   field returned by {@link import("./resolve.js").resolveConfig} to
 *   guarantee the writer lands on the exact file the loader read from.
 * - `profile` — derives `~/.qontoctl/{profile}.yaml`.
 * - `home` — overrides `homedir()` for resolution (testing).
 * - `env` — overrides env-var lookup for `QONTOCTL_CONFIG_FILE` (testing).
 *
 * No `cwd` option — CWD is never inspected by writers. See #479.
 */
export type WriteOptions = LoadOptions;

/**
 * Saves OAuth tokens to the user's config file.
 *
 * Reads the existing YAML file, updates the `oauth` section with new token
 * values, and writes it back atomically (temp-file + rename) under an
 * advisory lock. Creates the file and directory if they don't exist.
 * File permissions are set to 0o600 (owner read/write only).
 *
 * @param tokens - The token values to save
 * @param options - Optional path/profile/home — see {@link WriteOptions}
 *
 * @throws {ConfigError} `CONFLICT` on lock contention, `PERMISSION` on
 *   filesystem permission errors. Other errors propagate as-is.
 */
export async function saveOAuthTokens(tokens: TokenUpdate, options?: WriteOptions): Promise<void> {
  const path = resolveConfigFilePath(options);
  await withLockedFile(path, async () => {
    const doc = await readDoc(path);
    const existingOAuth = getOAuthSection(doc) ?? {};

    // Remove legacy key if present
    delete existingOAuth["token-expires-at"];

    doc["oauth"] = {
      ...existingOAuth,
      "access-token": tokens.accessToken,
      "access-token-expires-at": tokens.accessTokenExpiresAt,
      ...(tokens.refreshToken !== undefined ? { "refresh-token": tokens.refreshToken } : {}),
    };

    await atomicWriteDoc(path, doc);
  });
}

/**
 * Saves OAuth client credentials (client-id and client-secret) to the config file.
 *
 * Reads the existing YAML file, updates the `oauth` section with client
 * credentials, and writes it back atomically under an advisory lock.
 * Creates the file and directory if needed.
 */
export async function saveOAuthClientCredentials(
  credentials: { readonly clientId: string; readonly clientSecret: string },
  options?: WriteOptions,
): Promise<void> {
  const path = resolveConfigFilePath(options);
  await withLockedFile(path, async () => {
    const doc = await readDoc(path);
    const existingOAuth = getOAuthSection(doc) ?? {};

    doc["oauth"] = {
      ...existingOAuth,
      "client-id": credentials.clientId,
      "client-secret": credentials.clientSecret,
    };

    await atomicWriteDoc(path, doc);
  });
}

/**
 * Clears OAuth tokens from the user's config file.
 *
 * Removes `access-token`, `refresh-token`, and `token-expires-at` from the
 * `oauth` section, preserving `client-id` and `client-secret`. No-op when
 * the file or `oauth` section does not exist.
 */
export async function clearOAuthTokens(options?: WriteOptions): Promise<void> {
  const path = resolveConfigFilePath(options);

  // Fast path: if the file doesn't exist, nothing to clear and no need to
  // create one just to lock on. Probe via readFile and short-circuit.
  let exists = true;
  try {
    await readFile(path, "utf-8");
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      exists = false;
    }
  }
  if (!exists) {
    return;
  }

  await withLockedFile(path, async () => {
    const doc = await readDoc(path);
    const oauth = getOAuthSection(doc);
    if (oauth === undefined) return;

    delete oauth["access-token"];
    delete oauth["refresh-token"];
    delete oauth["token-expires-at"];
    delete oauth["access-token-expires-at"];

    await atomicWriteDoc(path, doc);
  });
}

/**
 * Saves OAuth scopes to the user's config file.
 *
 * Reads the existing YAML file, updates the `oauth.scopes` field, and
 * writes it back atomically under an advisory lock. Creates the file and
 * directory if they don't exist.
 */
export async function saveOAuthScopes(scopes: readonly string[], options?: WriteOptions): Promise<void> {
  const path = resolveConfigFilePath(options);
  await withLockedFile(path, async () => {
    const doc = await readDoc(path);
    const existingOAuth = getOAuthSection(doc) ?? {};

    doc["oauth"] = {
      ...existingOAuth,
      scopes: [...scopes],
    };

    await atomicWriteDoc(path, doc);
  });
}

/**
 * Returns the `oauth` subsection of `doc` if it is a plain object, else
 * `undefined`. Centralizes the type-guard the writers all need before
 * mutating or extending the section.
 */
function getOAuthSection(doc: Record<string, unknown>): Record<string, unknown> | undefined {
  const oauth = doc["oauth"];
  if (typeof oauth === "object" && oauth !== null && !Array.isArray(oauth)) {
    return oauth as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Reads and parses the YAML doc at `path`, returning an empty doc if the
 * file does not exist. Throws on parse errors and on permission errors.
 */
async function readDoc(path: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed: unknown = parseYaml(content);
    if (parsed !== null && parsed !== undefined && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (error: unknown) {
    if (isNodeError(error)) {
      if (error.code === "ENOENT") {
        return {};
      }
      if (error.code === "EACCES" || error.code === "EPERM") {
        throw new ConfigError(`Permission denied reading config file "${path}".`, "PERMISSION");
      }
    }
    throw error;
  }
}

/**
 * Atomically writes the YAML serialization of `doc` to `path` via a
 * temp-file + rename pattern. The temp file inherits 0o600 mode; rename is
 * atomic on POSIX (and best-effort on Windows via `node:fs/promises`).
 *
 * On any failure mid-write, the temp file is best-effort removed so the
 * destination remains in its prior state — never truncated, never left as
 * a 0-byte file the user is locked out of.
 */
async function atomicWriteDoc(path: string, doc: Record<string, unknown>): Promise<void> {
  const yaml = stringifyYaml(doc);
  // Temp file lives next to the target so `rename` is intra-filesystem
  // (cross-fs rename is non-atomic on most platforms). PID + monotonic
  // suffix avoids collision when the same process performs back-to-back
  // writes within the lock.
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  try {
    await writeFile(tmpPath, yaml, { mode: FILE_MODE });
    await rename(tmpPath, path);
  } catch (error: unknown) {
    await unlink(tmpPath).catch(() => {
      /* best-effort */
    });
    if (isNodeError(error) && (error.code === "EACCES" || error.code === "EPERM")) {
      throw new ConfigError(`Permission denied writing config file "${path}".`, "PERMISSION");
    }
    throw error;
  }
}

/**
 * Acquires an advisory lock on `path` (creating the file if needed),
 * runs `fn`, then releases. Concurrent callers wait per
 * {@link LOCK_RETRY_OPTIONS} or surface a `CONFLICT` ConfigError.
 */
async function withLockedFile<T>(path: string, fn: () => Promise<T>): Promise<T> {
  // Ensure parent directory exists.
  await mkdir(dirname(path), { recursive: true });

  // Touch the file (idempotent) so proper-lockfile has a stable target.
  // 'a' opens for append + creates if missing; we don't write anything,
  // just close. Mode is applied only on creation.
  try {
    const handle = await open(path, "a", FILE_MODE);
    await handle.close();
  } catch (error: unknown) {
    if (isNodeError(error) && (error.code === "EACCES" || error.code === "EPERM")) {
      throw new ConfigError(`Permission denied creating config file "${path}".`, "PERMISSION");
    }
    throw error;
  }

  let release: () => Promise<void>;
  try {
    release = await lockfile.lock(path, {
      retries: LOCK_RETRY_OPTIONS,
      stale: LOCK_STALE_MS,
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(
      `Could not acquire lock on "${path}" (another process may be writing). ${detail}`,
      "CONFLICT",
    );
  }

  try {
    return await fn();
  } finally {
    try {
      await release();
    } catch {
      /* best-effort release; lock will be reaped by stale timeout */
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
