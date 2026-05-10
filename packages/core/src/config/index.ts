// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export type {
  ApiKeyCredentials,
  AuthConfig,
  AuthPreference,
  OAuthCredentials,
  QontoctlConfig,
  ConfigResult,
  ResolveOptions,
  ScaConfig,
} from "./types.js";
export { AUTH_PREFERENCES, DEFAULT_AUTH_PREFERENCE } from "./types.js";
export { resolveConfig, resolveConfigPath, resolveScaMethod, ConfigError } from "./resolve.js";
export type { ConfigErrorCode } from "./resolve.js";
export { loadConfigFile, resolveConfigFilePath } from "./loader.js";
export type { LoadOptions, LoadResult } from "./loader.js";
export { isValidProfileName, validateConfig } from "./validate.js";
export type { ValidationResult } from "./validate.js";
export { applyEnvOverlay } from "./env.js";
export type { EnvOverlayConfig, EnvOverlayResult, StaticOAuthFields } from "./env.js";
export { saveOAuthTokens, saveOAuthClientCredentials, clearOAuthTokens, saveOAuthScopes } from "./writer.js";
export type { TokenUpdate, WriteOptions } from "./writer.js";
