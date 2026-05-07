// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { ConfigResult, OAuthCredentials, QontoctlConfig, ResolveOptions } from "./types.js";
import { loadConfigFile } from "./loader.js";
import { validateConfig } from "./validate.js";
import { applyEnvOverlay, type EnvOverlayConfig } from "./env.js";
import { API_BASE_URL, SANDBOX_BASE_URL } from "../constants.js";

/**
 * Sandbox-only SCA method that triggers a mock SCA challenge instead of
 * requiring a paired-device enrollment. Defaulted automatically when a
 * staging token is configured and no method is otherwise set, so
 * sandbox-targeted code paths get an exercisable SCA flow out of the box.
 */
const SANDBOX_DEFAULT_SCA_METHOD = "mock";

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
 * 3. Overlaying environment variables (static fields only)
 * 4. Re-attaching runtime-mutable file fields (refreshToken,
 *    accessTokenExpiresAt, scopes) that env-overlay deliberately does not
 *    cover — see {@link applyEnvOverlay}.
 * 5. Verifying that credentials are present
 * 6. Resolving the API endpoint
 *
 * Endpoint precedence:
 *   QONTOCTL_ENDPOINT > staging-token presence > profile endpoint > default
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

  // 3. Overlay env vars (static fields only — env never carries
  //    refreshToken/accessTokenExpiresAt/scopes)
  const fileStatic = pickStaticFields(fileConfig);
  const { config: overlaidStatic, accessTokenFromEnv } = applyEnvOverlay(fileStatic, {
    profile,
    env: options?.env,
  });

  // 4. Re-attach runtime-mutable file fields (refreshToken,
  //    accessTokenExpiresAt, scopes) — env never overrides these, but the
  //    file copy must be preserved through the env-overlay pipeline.
  const config = mergeRuntimeFields(overlaidStatic, fileConfig);

  // 5. Verify credentials are present (at least one auth method)
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

  // 6. Resolve endpoint
  const endpoint = resolveEndpoint(config);

  return { config, endpoint, warnings, oauthAccessTokenFromEnv: accessTokenFromEnv };
}

/**
 * Extracts the static-fields-only view of a {@link QontoctlConfig} for
 * env-overlay processing. Drops runtime-mutable OAuth fields
 * (`refreshToken`, `accessTokenExpiresAt`, `scopes`) which env never sets;
 * these are re-attached by {@link mergeRuntimeFields} after env-overlay.
 */
function pickStaticFields(config: QontoctlConfig): EnvOverlayConfig {
  const result: EnvOverlayConfig = {};
  if (config.apiKey !== undefined) {
    result.apiKey = config.apiKey;
  }
  if (config.oauth !== undefined) {
    const { clientId, clientSecret, accessToken, stagingToken } = config.oauth;
    result.oauth = {
      clientId,
      clientSecret,
      ...(accessToken !== undefined ? { accessToken } : {}),
      ...(stagingToken !== undefined ? { stagingToken } : {}),
    };
  }
  if (config.endpoint !== undefined) {
    result.endpoint = config.endpoint;
  }
  if (config.sca !== undefined) {
    result.sca = config.sca;
  }
  return result;
}

/**
 * Re-attaches runtime-mutable OAuth fields (`refreshToken`,
 * `accessTokenExpiresAt`, `scopes`) from `source` to the env-overlaid
 * static portion. Env never reads these fields; the file copy is
 * authoritative for the resolved config.
 */
function mergeRuntimeFields(staticPortion: EnvOverlayConfig, source: QontoctlConfig): QontoctlConfig {
  const result: QontoctlConfig = {
    ...(staticPortion.apiKey !== undefined ? { apiKey: staticPortion.apiKey } : {}),
    ...(staticPortion.endpoint !== undefined ? { endpoint: staticPortion.endpoint } : {}),
    ...(staticPortion.sca !== undefined ? { sca: staticPortion.sca } : {}),
  };

  if (staticPortion.oauth !== undefined) {
    const oauth: OAuthCredentials = {
      clientId: staticPortion.oauth.clientId,
      clientSecret: staticPortion.oauth.clientSecret,
      ...(staticPortion.oauth.accessToken !== undefined ? { accessToken: staticPortion.oauth.accessToken } : {}),
      ...(staticPortion.oauth.stagingToken !== undefined ? { stagingToken: staticPortion.oauth.stagingToken } : {}),
      ...(source.oauth?.refreshToken !== undefined ? { refreshToken: source.oauth.refreshToken } : {}),
      ...(source.oauth?.accessTokenExpiresAt !== undefined
        ? { accessTokenExpiresAt: source.oauth.accessTokenExpiresAt }
        : {}),
      ...(source.oauth?.scopes !== undefined ? { scopes: source.oauth.scopes } : {}),
    };
    result.oauth = oauth;
  }

  return result;
}

/**
 * Resolves the API endpoint from config.
 *
 * Precedence (env overlay already applied, so env vars win over file values):
 *   explicit endpoint > staging-token presence > default (production)
 */
function resolveEndpoint(config: { endpoint?: string; oauth?: { stagingToken?: string } }): string {
  if (config.endpoint !== undefined) {
    return config.endpoint;
  }
  if (config.oauth?.stagingToken !== undefined) {
    return SANDBOX_BASE_URL;
  }
  return API_BASE_URL;
}

/**
 * Resolves the effective SCA method (`X-Qonto-2fa-Preference` header value).
 *
 * Precedence (highest first):
 *   1. `override` — caller-provided value (e.g., the `--sca-method` CLI flag).
 *   2. `config.sca.method` — file or env-overlaid value.
 *   3. Sandbox auto-default `"mock"` — applied only when a staging token is
 *      present (i.e. `config.oauth.stagingToken` is set), so sandbox writes
 *      can complete without a paired-device enrollment. **Production paths
 *      never auto-default**: if no staging token is configured and no
 *      override/config method is provided, the result is `undefined` and the
 *      header is omitted (Qonto then applies its own default).
 *
 * The shape (`paired-device`, `passkey`, `sms-otp`, `mock`) is passed through
 * verbatim — Qonto's API governs which values are valid for the active
 * environment. Mis-use returns `428 sca_not_enrolled`/configuration errors;
 * it does not corrupt state.
 */
export function resolveScaMethod(config: QontoctlConfig, override?: string): string | undefined {
  if (override !== undefined) {
    return override;
  }
  if (config.sca?.method !== undefined) {
    return config.sca.method;
  }
  if (config.oauth?.stagingToken !== undefined) {
    return SANDBOX_DEFAULT_SCA_METHOD;
  }
  return undefined;
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
