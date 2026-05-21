// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export { AuthError, buildApiKeyAuthorization } from "./api-key.js";
export { buildOAuthAuthorization, OAuthNoTokenError } from "./oauth.js";
export { createOAuthAuthorization } from "./oauth-authorization-factory.js";
export type { CreateOAuthAuthorizationOptions } from "./oauth-authorization-factory.js";
export { generateCodeVerifier, generateCodeChallenge } from "./pkce.js";
export { exchangeCode, refreshAccessToken, revokeToken, OAuthRefreshError } from "./oauth-service.js";
export type { OAuthTokens } from "./oauth-service.js";
export { isAuthPreference, resolveAuthPreference, selectAuthChain } from "./preference.js";
export type { ApiKeyInvalidReason, AuthChainSelection, AuthSlot, AvailableCredentials } from "./preference.js";
