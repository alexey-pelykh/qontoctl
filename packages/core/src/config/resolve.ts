// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { ConfigResult, OAuthCredentials, QontoctlConfig, ResolveOptions } from "./types.js";
import { loadConfigFile, resolveConfigFilePath } from "./loader.js";
import { isValidProfileName, validateConfig } from "./validate.js";
import { applyEnvOverlay, type EnvOverlayConfig } from "./env.js";
import { API_BASE_URL, SANDBOX_BASE_URL } from "../constants.js";
import { stat } from "node:fs/promises";

/**
 * Sandbox-only SCA method that triggers a mock SCA challenge instead of
 * requiring a paired-device enrollment. Defaulted automatically when a
 * staging token is configured and no method is otherwise set, so
 * sandbox-targeted code paths get an exercisable SCA flow out of the box.
 */
const SANDBOX_DEFAULT_SCA_METHOD = "mock";

/**
 * Discriminator for {@link ConfigError}, allowing callers (CLI/MCP error
 * handlers) to switch on cause without parsing message strings.
 *
 * - `NO_CREDS` — no credentials found in any source (file, env, profile).
 * - `PARSE` — YAML parse failure.
 * - `VALIDATION` — schema validation failure or invalid profile name.
 * - `PERMISSION` — file system permission denied (EACCES/EPERM) on read or write.
 * - `CONFLICT` — concurrent write contention (lock could not be acquired
 *   within the configured retry window).
 */
export type ConfigErrorCode = "NO_CREDS" | "PARSE" | "VALIDATION" | "PERMISSION" | "CONFLICT";

export class ConfigError extends Error {
  readonly code: ConfigErrorCode;

  constructor(message: string, code: ConfigErrorCode) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

/**
 * File mode bits to check when warning about insecure permissions on a
 * config file containing OAuth client-secret or access-token. We warn when
 * group or world has any read access — the file should be 0o600 (or stricter)
 * for OAuth credentials.
 */
const INSECURE_PERMS_MASK = 0o077;

/**
 * Resolves the full configuration by:
 * 1. Validating the profile name (if any).
 * 2. Loading the appropriate YAML config file (explicit path > env > profile > home).
 * 3. Validating the schema (producing warnings for unknown keys).
 * 4. Overlaying environment variables (static fields only).
 * 5. Re-attaching runtime-mutable file fields (refreshToken,
 *    accessTokenExpiresAt, scopes) that env-overlay deliberately does not
 *    cover — see {@link applyEnvOverlay}.
 * 6. Verifying that credentials are present.
 * 7. Resolving the API endpoint.
 * 8. Emitting a stderr warning if the loaded file has insecure permissions
 *    on OAuth-bearing content.
 *
 * Endpoint precedence:
 *   QONTOCTL_ENDPOINT > staging-token presence > profile endpoint > default
 *
 * @throws {ConfigError} on validation errors or missing credentials. Always
 *   includes a {@link ConfigErrorCode} discriminator.
 */
export async function resolveConfig(options?: ResolveOptions): Promise<ConfigResult> {
  const profile = options?.profile;

  // 1. Validate profile name (if any) before any I/O.
  if (profile !== undefined && !isValidProfileName(profile)) {
    throw new ConfigError(
      `Invalid profile name "${profile}". Profile names must not contain path separators, parent-directory references, glob characters, or shadow reserved env-var suffixes.`,
      "VALIDATION",
    );
  }

  // 2. Load config file via deterministic precedence.
  const { raw, path } = await loadConfigFile({
    path: options?.path,
    profile,
    home: options?.home,
    env: options?.env,
  });

  // 3. Validate schema.
  const { config: fileConfig, warnings, errors } = validateConfig(raw);

  if (errors.length > 0) {
    const location = path !== undefined ? ` (${path})` : "";
    throw new ConfigError(`Invalid configuration${location}:\n  - ${errors.join("\n  - ")}`, "VALIDATION");
  }

  // 4. Overlay env vars (static fields only — env never carries
  //    refreshToken/accessTokenExpiresAt/scopes).
  const fileStatic = pickStaticFields(fileConfig);
  const { config: overlaidStatic, accessTokenFromEnv } = applyEnvOverlay(fileStatic, {
    profile,
    env: options?.env,
  });

  // 5. Re-attach runtime-mutable file fields (refreshToken,
  //    accessTokenExpiresAt, scopes) — env never overrides these, but the
  //    file copy must be preserved through the env-overlay pipeline.
  const config = mergeRuntimeFields(overlaidStatic, fileConfig);

  // 6. Verify credentials are present (at least one auth method).
  if (config.apiKey === undefined && config.oauth === undefined) {
    const searchedLocations = describeSearchLocations(profile, path, options?.path, options?.env);
    throw new ConfigError(`No credentials found. ${searchedLocations}`, "NO_CREDS");
  }

  if (config.apiKey !== undefined) {
    if (config.apiKey.organizationSlug === "") {
      throw new ConfigError('Missing required field "organization-slug" in api-key credentials', "VALIDATION");
    }

    if (config.apiKey.secretKey === "") {
      throw new ConfigError('Missing required field "secret-key" in api-key credentials', "VALIDATION");
    }
  }

  if (config.oauth !== undefined) {
    if (config.oauth.clientId === "") {
      throw new ConfigError('Missing required field "client-id" in oauth credentials', "VALIDATION");
    }

    if (config.oauth.clientSecret === "") {
      throw new ConfigError('Missing required field "client-secret" in oauth credentials', "VALIDATION");
    }
  }

  // 7. Resolve endpoint.
  const endpoint = resolveEndpoint(config);

  // 8. Permission warning for OAuth-bearing files (best-effort, non-fatal).
  if (path !== undefined && config.oauth !== undefined) {
    await maybeWarnInsecurePermissions(path, warnings);
  }

  return { config, endpoint, warnings, path, oauthAccessTokenFromEnv: accessTokenFromEnv };
}

/**
 * Resolves the absolute path that {@link resolveConfig} would load from,
 * without performing any I/O on file content. Useful for callers that need
 * to know the destination of a write before calling a writer entrypoint
 * (e.g., `auth login` choosing where to persist new tokens when no file
 * yet exists).
 *
 * Precedence mirrors {@link resolveConfig}:
 *   path > QONTOCTL_CONFIG_FILE > profile-derived > home default
 */
export function resolveConfigPath(options?: ResolveOptions): string {
  return resolveConfigFilePath({
    path: options?.path,
    profile: options?.profile,
    home: options?.home,
    env: options?.env,
  });
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
  if (config.auth !== undefined) {
    result.auth = config.auth;
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
    ...(staticPortion.auth !== undefined ? { auth: staticPortion.auth } : {}),
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

/**
 * Best-effort permission check on the loaded config file. Emits a stderr
 * warning (and appends to the warnings array) when an OAuth-bearing file is
 * group- or world-readable. Skipped silently on stat failure — permission
 * hygiene is advisory, not a gate.
 */
async function maybeWarnInsecurePermissions(path: string, warnings: string[]): Promise<void> {
  try {
    const info = await stat(path);
    // `mode` is 0o100755-style; mask off file-type bits.
    const perms = info.mode & 0o777;
    if ((perms & INSECURE_PERMS_MASK) !== 0) {
      const message = `Config file ${path} contains OAuth credentials but has permissions ${perms.toString(8).padStart(3, "0")} (group/world readable). Tighten with: chmod 600 ${path}`;
      warnings.push(message);
      // Best-effort stderr emit; not all callers print warnings, so surface
      // immediately for the security-relevant case.
      process.stderr.write(`warning: ${message}\n`);
    }
  } catch {
    // stat failed (e.g., race on file deletion); silently skip — permission
    // checks are not a load gate.
  }
}

function describeSearchLocations(
  profile: string | undefined,
  loadedPath: string | undefined,
  explicitPath: string | undefined,
  env: Record<string, string | undefined> | undefined,
): string {
  if (explicitPath !== undefined) {
    return `Explicit path "${explicitPath}" was loaded but contains no credentials.`;
  }
  if (profile !== undefined) {
    return `Checked ~/.qontoctl/${profile}.yaml and QONTOCTL_${profile.toUpperCase().replaceAll("-", "_")}_* env vars.`;
  }
  const envFile = (env ?? (process.env as Record<string, string | undefined>))["QONTOCTL_CONFIG_FILE"];
  if (envFile !== undefined) {
    return `Checked QONTOCTL_CONFIG_FILE="${envFile}" and QONTOCTL_* env vars.`;
  }
  if (loadedPath !== undefined) {
    return `Found config at ${loadedPath} but it contains no credentials. Also checked QONTOCTL_* env vars.`;
  }
  return "Checked ~/.qontoctl.yaml (home), QONTOCTL_CONFIG_FILE env var, and QONTOCTL_* env vars. Use --config <path>, set QONTOCTL_CONFIG_FILE, or pass --profile <name>.";
}
