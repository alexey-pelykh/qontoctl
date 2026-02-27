// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  HttpClient,
  QontoApiError,
  QontoRateLimitError,
  type HttpClientLogger,
  type HttpClientOptions,
  type QontoApiErrorEntry,
} from "./http-client.js";

export {
  resolveConfig,
  ConfigError,
  loadConfigFile,
  validateConfig,
  applyEnvOverlay,
} from "./config/index.js";

export type {
  ApiKeyCredentials,
  QontoctlConfig,
  ConfigResult,
  ResolveOptions,
  LoadResult,
  ValidationResult,
} from "./config/index.js";

export { AuthError, buildApiKeyAuthorization } from "./auth/index.js";
