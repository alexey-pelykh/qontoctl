// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { AuthPreference, QontoctlConfig } from "./types.js";
import { AUTH_PREFERENCES } from "./types.js";

/**
 * Profile names that would shadow no-profile env-var suffixes.
 *
 * Env vars are derived by `QONTOCTL_<PROFILE_UPPERCASE>_<SUFFIX>`. A profile
 * named `endpoint` would generate `QONTOCTL_ENDPOINT_*` patterns that collide
 * with the no-profile `QONTOCTL_ENDPOINT` variable, producing an ambiguous
 * resolution rule. Profiles matching any reserved suffix (case-insensitive,
 * after `-` → `_` normalization) are rejected at resolution time.
 *
 * `REFRESH_TOKEN` is included even though `QONTOCTL_REFRESH_TOKEN` is not
 * read at runtime (per #495) — it remains a reserved suffix to prevent
 * future re-introduction from accidentally re-shadowing.
 */
const RESERVED_PROFILE_SUFFIXES = new Set([
  "ORGANIZATION_SLUG",
  "SECRET_KEY",
  "ENDPOINT",
  "CLIENT_ID",
  "CLIENT_SECRET",
  "ACCESS_TOKEN",
  "REFRESH_TOKEN",
  "SCOPES",
  "STAGING_TOKEN",
  "SCA_METHOD",
  "AUTH",
  "CONFIG_FILE",
]);

/**
 * Check whether a profile name is safe to use as a filename and as an
 * env-var suffix.
 *
 * Rejects:
 *   - Path separators (`/`, `\`) and parent-directory references (`..`) —
 *     prevents path-traversal attacks via `--profile ../foo`.
 *   - Glob characters (`*`, `?`, `[`, `]`) — these would silently pass
 *     through to filesystem APIs and surprise users expecting glob expansion.
 *   - Empty strings.
 *   - Reserved env-var suffixes — see {@link RESERVED_PROFILE_SUFFIXES}.
 */
export function isValidProfileName(name: string): boolean {
  if (name === "") return false;
  if (/[/\\]/.test(name)) return false;
  if (name.includes("..")) return false;
  if (/[*?[\]]/.test(name)) return false;
  const normalized = name.toUpperCase().replaceAll("-", "_");
  if (RESERVED_PROFILE_SUFFIXES.has(normalized)) return false;
  return true;
}

const KNOWN_TOP_LEVEL_KEYS = new Set(["api-key", "oauth", "endpoint", "sca", "auth"]);
const KNOWN_API_KEY_KEYS = new Set(["organization-slug", "secret-key"]);
const KNOWN_OAUTH_KEYS = new Set([
  "client-id",
  "client-secret",
  "access-token",
  "refresh-token",
  "token-expires-at",
  "access-token-expires-at",
  "scopes",
  "staging-token",
]);
const KNOWN_SCA_KEYS = new Set(["method"]);
const KNOWN_AUTH_KEYS = new Set(["preference"]);

export interface ValidationResult {
  config: QontoctlConfig;
  warnings: string[];
  errors: string[];
}

/**
 * Validates a parsed YAML document against the expected config schema.
 *
 * - Known keys with wrong types produce errors.
 * - Unknown keys produce warnings (forward compatibility).
 * - Returns a partially-populated config for valid fields.
 */
export function validateConfig(raw: unknown): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const config: QontoctlConfig = {};

  if (raw === null || raw === undefined) {
    return { config, warnings, errors };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    errors.push("Configuration must be a YAML mapping");
    return { config, warnings, errors };
  }

  const doc = raw as Record<string, unknown>;

  for (const key of Object.keys(doc)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`Unknown configuration key: "${key}"`);
    }
  }

  if ("api-key" in doc) {
    const apiKeySection = doc["api-key"];

    if (apiKeySection === null || apiKeySection === undefined) {
      // api-key section present but empty — not an error, just no credentials from file
    } else if (typeof apiKeySection !== "object" || Array.isArray(apiKeySection)) {
      errors.push('"api-key" must be a mapping');
    } else {
      const apiKey = apiKeySection as Record<string, unknown>;

      for (const key of Object.keys(apiKey)) {
        if (!KNOWN_API_KEY_KEYS.has(key)) {
          warnings.push(`Unknown key in "api-key": "${key}"`);
        }
      }

      const orgSlug = apiKey["organization-slug"];
      const secretKey = apiKey["secret-key"];

      if (orgSlug !== undefined && typeof orgSlug !== "string") {
        errors.push('"api-key.organization-slug" must be a string');
      }

      if (secretKey !== undefined && typeof secretKey !== "string") {
        errors.push('"api-key.secret-key" must be a string');
      }

      if (typeof orgSlug === "string" || typeof secretKey === "string") {
        config.apiKey = {
          organizationSlug: typeof orgSlug === "string" ? orgSlug : "",
          secretKey: typeof secretKey === "string" ? secretKey : "",
        };
      }
    }
  }

  if ("oauth" in doc) {
    const oauthSection = doc["oauth"];

    if (oauthSection === null || oauthSection === undefined) {
      // oauth section present but empty — not an error, just no credentials from file
    } else if (typeof oauthSection !== "object" || Array.isArray(oauthSection)) {
      errors.push('"oauth" must be a mapping');
    } else {
      const oauth = oauthSection as Record<string, unknown>;

      for (const key of Object.keys(oauth)) {
        if (!KNOWN_OAUTH_KEYS.has(key)) {
          warnings.push(`Unknown key in "oauth": "${key}"`);
        }
      }

      const clientId = oauth["client-id"];
      const clientSecret = oauth["client-secret"];
      const accessToken = oauth["access-token"];
      const refreshToken = oauth["refresh-token"];
      // Prefer new key; fall back to legacy key for backward compat
      const accessTokenExpiresAt = oauth["access-token-expires-at"] ?? oauth["token-expires-at"];
      const scopes = oauth["scopes"];
      const stagingToken = oauth["staging-token"];

      if (clientId !== undefined && typeof clientId !== "string") {
        errors.push('"oauth.client-id" must be a string');
      }

      if (clientSecret !== undefined && typeof clientSecret !== "string") {
        errors.push('"oauth.client-secret" must be a string');
      }

      if (accessToken !== undefined && typeof accessToken !== "string") {
        errors.push('"oauth.access-token" must be a string');
      }

      if (refreshToken !== undefined && typeof refreshToken !== "string") {
        errors.push('"oauth.refresh-token" must be a string');
      }

      if (accessTokenExpiresAt !== undefined && typeof accessTokenExpiresAt !== "string") {
        errors.push('"oauth.access-token-expires-at" must be a string');
      }

      if (scopes !== undefined && (!Array.isArray(scopes) || !scopes.every((s: unknown) => typeof s === "string"))) {
        errors.push('"oauth.scopes" must be an array of strings');
      }

      if (stagingToken !== undefined && typeof stagingToken !== "string") {
        errors.push('"oauth.staging-token" must be a string');
      }

      if (typeof clientId === "string" || typeof clientSecret === "string") {
        config.oauth = {
          clientId: typeof clientId === "string" ? clientId : "",
          clientSecret: typeof clientSecret === "string" ? clientSecret : "",
          ...(typeof accessToken === "string" ? { accessToken } : {}),
          ...(typeof refreshToken === "string" ? { refreshToken } : {}),
          ...(typeof accessTokenExpiresAt === "string" ? { accessTokenExpiresAt } : {}),
          ...(Array.isArray(scopes) && scopes.every((s: unknown) => typeof s === "string") ? { scopes } : {}),
          ...(typeof stagingToken === "string" ? { stagingToken } : {}),
        };
      }
    }
  }

  if ("endpoint" in doc) {
    const endpoint = doc["endpoint"];
    if (endpoint !== null && endpoint !== undefined) {
      if (typeof endpoint !== "string") {
        errors.push('"endpoint" must be a string');
      } else {
        try {
          new URL(endpoint);
          config.endpoint = endpoint;
        } catch {
          errors.push('"endpoint" must be a valid URL');
        }
      }
    }
  }

  if ("sca" in doc) {
    const scaSection = doc["sca"];

    if (scaSection === null || scaSection === undefined) {
      // sca section present but empty — not an error
    } else if (typeof scaSection !== "object" || Array.isArray(scaSection)) {
      errors.push('"sca" must be a mapping');
    } else {
      const sca = scaSection as Record<string, unknown>;

      for (const key of Object.keys(sca)) {
        if (!KNOWN_SCA_KEYS.has(key)) {
          warnings.push(`Unknown key in "sca": "${key}"`);
        }
      }

      const method = sca["method"];

      if (method !== undefined && typeof method !== "string") {
        errors.push('"sca.method" must be a string');
      }

      if (typeof method === "string") {
        config.sca = { method };
      }
    }
  }

  if ("auth" in doc) {
    const authSection = doc["auth"];

    if (authSection === null || authSection === undefined) {
      // auth section present but empty — not an error
    } else if (typeof authSection !== "object" || Array.isArray(authSection)) {
      errors.push('"auth" must be a mapping');
    } else {
      const auth = authSection as Record<string, unknown>;

      for (const key of Object.keys(auth)) {
        if (!KNOWN_AUTH_KEYS.has(key)) {
          warnings.push(`Unknown key in "auth": "${key}"`);
        }
      }

      const preference = auth["preference"];

      if (preference !== undefined) {
        if (typeof preference !== "string") {
          errors.push('"auth.preference" must be a string');
        } else if (!(AUTH_PREFERENCES as readonly string[]).includes(preference)) {
          // Hard error here — unlike env vars, file values can be edited carefully,
          // so a typo (`api-key-only` instead of `api-key`) deserves a clear failure
          // rather than a silent fallback to the default direction.
          errors.push(`"auth.preference" must be one of: ${AUTH_PREFERENCES.join(", ")} (got "${preference}")`);
        } else {
          config.auth = { preference: preference as AuthPreference };
        }
      }
    }
  }

  return { config, warnings, errors };
}
