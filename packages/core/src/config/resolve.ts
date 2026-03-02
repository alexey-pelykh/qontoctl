// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { ConfigResult, ResolveOptions } from "./types.js";
import { loadConfigFile } from "./loader.js";
import { validateConfig } from "./validate.js";
import { applyEnvOverlay } from "./env.js";
import { API_BASE_URL, SANDBOX_BASE_URL } from "../constants.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Resolves the full configuration by:
 * 1. Loading the appropriate YAML config file (profile-aware)
 * 2. Validating the schema (producing warnings for unknown keys)
 * 3. Overlaying environment variables
 * 4. Verifying that credentials are present
 * 5. Resolving the API endpoint
 *
 * Endpoint precedence:
 *   QONTOCTL_ENDPOINT > QONTOCTL_SANDBOX > profile endpoint > profile sandbox > default
 *
 * @throws {ConfigError} on validation errors or missing credentials
 */
export async function resolveConfig(options?: ResolveOptions): Promise<ConfigResult> {
  const profile = options?.profile;

  // 1. Load config file
  const { raw, path } = await loadConfigFile({
    profile,
    cwd: options?.cwd,
    home: options?.home,
  });

  // 2. Validate
  const { config: fileConfig, warnings, errors } = validateConfig(raw);

  if (errors.length > 0) {
    const location = path !== undefined ? ` (${path})` : "";
    throw new ConfigError(`Invalid configuration${location}:\n  - ${errors.join("\n  - ")}`);
  }

  // 3. Overlay env vars
  const config = applyEnvOverlay(fileConfig, {
    profile,
    env: options?.env,
  });

  // 4. Verify credentials are present (at least one auth method)
  if (config.apiKey === undefined && config.oauth === undefined) {
    const searchedLocations = describeSearchLocations(profile, path);
    throw new ConfigError(`No credentials found. ${searchedLocations}`);
  }

  if (config.apiKey !== undefined) {
    if (config.apiKey.organizationSlug === "") {
      throw new ConfigError('Missing required field "organization-slug" in api-key credentials');
    }

    if (config.apiKey.secretKey === "") {
      throw new ConfigError('Missing required field "secret-key" in api-key credentials');
    }
  }

  if (config.oauth !== undefined) {
    if (config.oauth.clientId === "") {
      throw new ConfigError('Missing required field "client-id" in oauth credentials');
    }

    if (config.oauth.clientSecret === "") {
      throw new ConfigError('Missing required field "client-secret" in oauth credentials');
    }
  }

  // 5. Resolve endpoint
  const endpoint = resolveEndpoint(config);

  return { config, endpoint, warnings };
}

/**
 * Resolves the API endpoint from config.
 *
 * Precedence (env overlay already applied, so env vars win over file values):
 *   explicit endpoint > sandbox flag > default (production)
 */
function resolveEndpoint(config: { endpoint?: string; sandbox?: boolean }): string {
  if (config.endpoint !== undefined) {
    return config.endpoint;
  }
  if (config.sandbox === true) {
    return SANDBOX_BASE_URL;
  }
  return API_BASE_URL;
}

function describeSearchLocations(profile: string | undefined, loadedPath: string | undefined): string {
  if (profile !== undefined) {
    return `Checked ~/.qontoctl/${profile}.yaml and QONTOCTL_${profile.toUpperCase().replaceAll("-", "_")}_* env vars.`;
  }
  if (loadedPath !== undefined) {
    return `Found config at ${loadedPath} but it contains no api-key credentials. Also checked QONTOCTL_* env vars.`;
  }
  return "Checked .qontoctl.yaml (CWD), ~/.qontoctl.yaml (home), and QONTOCTL_* env vars.";
}
