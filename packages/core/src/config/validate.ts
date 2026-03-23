// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { QontoctlConfig } from "./types.js";

/**
 * Check whether a profile name is safe to use as a filename.
 *
 * Rejects names containing path separators (`/`, `\`) or parent-directory
 * references (`..`) to prevent path-traversal attacks.
 */
export function isValidProfileName(name: string): boolean {
  return !/[/\\]/.test(name) && !name.includes("..");
}

const KNOWN_TOP_LEVEL_KEYS = new Set(["api-key", "oauth", "endpoint", "sandbox"]);
const KNOWN_API_KEY_KEYS = new Set(["organization-slug", "secret-key"]);
const KNOWN_OAUTH_KEYS = new Set([
  "client-id",
  "client-secret",
  "access-token",
  "refresh-token",
  "token-expires-at",
  "access-token-expires-at",
  "scopes",
]);

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

      if (typeof clientId === "string" || typeof clientSecret === "string") {
        config.oauth = {
          clientId: typeof clientId === "string" ? clientId : "",
          clientSecret: typeof clientSecret === "string" ? clientSecret : "",
          ...(typeof accessToken === "string" ? { accessToken } : {}),
          ...(typeof refreshToken === "string" ? { refreshToken } : {}),
          ...(typeof accessTokenExpiresAt === "string" ? { accessTokenExpiresAt } : {}),
          ...(Array.isArray(scopes) && scopes.every((s: unknown) => typeof s === "string") ? { scopes } : {}),
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

  if ("sandbox" in doc) {
    const sandbox = doc["sandbox"];
    if (sandbox !== null && sandbox !== undefined) {
      if (typeof sandbox !== "boolean") {
        errors.push('"sandbox" must be a boolean');
      } else {
        config.sandbox = sandbox;
      }
    }
  }

  return { config, warnings, errors };
}
