// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { OAuthRefreshError } from "../../auth/oauth-service.js";
import { QontoApiError } from "../../http-client.js";
import { getOrganization } from "../../services/organization.js";
import type { DiagnoseContext, DiagnosticCheck, DiagnosticResult } from "../types.js";

/**
 * Probes OAuth authentication via `GET /v2/organization`.
 *
 * Pre-detects an expired access token (or one within the 60s refresh
 * window the OAuth factory uses) so a successful call after refresh
 * can be reported as `warn` with `detail: "refreshed expired access token"`
 * — making the silent-refresh visible to the user (per AC scenario 2).
 *
 * Recognized failure modes:
 * - No access token configured → `fail` with "run qontoctl auth login"
 * - OAuth refresh rejected (`OAuthRefreshError`) → `fail` with login suggestion
 * - 401 after fresh token → `fail` (token issued but rejected by API)
 * - 5xx → `fail` with "Qonto upstream issue"
 * - Other network error → `fail` with connectivity hint
 */
export const oauthHealthCheck: DiagnosticCheck = {
  id: "auth.oauth-health",
  name: "OAuth health",
  kind: "live",
  requiresAuth: "oauth",
  requiresStagingToken: false,
  redactionFields: ["status_code", "refreshed", "expires_in_seconds"],
  run: async (ctx): Promise<DiagnosticResult> => {
    if (ctx.oauthClient === undefined) {
      return {
        checkId: "auth.oauth-health",
        status: "skip",
        detail: "oauth not configured",
        suggestedAction: null,
      };
    }
    if (ctx.config.oauth?.accessToken === undefined) {
      return {
        checkId: "auth.oauth-health",
        status: "fail",
        detail: "no access token in config",
        suggestedAction: "Run `qontoctl auth login` to obtain an access token",
      };
    }

    const wasExpired = isExpiredOrNearExpiry(ctx);
    try {
      await getOrganization(ctx.oauthClient);
    } catch (error) {
      return oauthFailureResult(error);
    }

    if (wasExpired) {
      return {
        checkId: "auth.oauth-health",
        status: "warn",
        detail: "refreshed expired access token",
        suggestedAction: null,
        evidence: { status_code: 200, refreshed: true },
      };
    }
    return {
      checkId: "auth.oauth-health",
      status: "ok",
      detail: "200 OK",
      suggestedAction: null,
      evidence: { status_code: 200, refreshed: false },
    };
  },
};

function isExpiredOrNearExpiry(ctx: DiagnoseContext): boolean {
  const expiresAt = ctx.config.oauth?.accessTokenExpiresAt;
  if (expiresAt === undefined) return false;
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return false;
  // Mirrors the 60s refresh window in `createOAuthAuthorization`.
  return expiry - Date.now() < 60_000;
}

function oauthFailureResult(error: unknown): DiagnosticResult {
  if (error instanceof OAuthRefreshError) {
    return {
      checkId: "auth.oauth-health",
      status: "fail",
      detail: "OAuth token refresh failed",
      suggestedAction: "Run `qontoctl auth login` to obtain a fresh refresh token",
    };
  }
  if (error instanceof QontoApiError) {
    const action =
      error.status === 401 || error.status === 403
        ? "OAuth token rejected — run `qontoctl auth login` to re-authenticate"
        : error.status >= 500
          ? "Qonto upstream issue — retry shortly; if persistent, check https://status.qonto.com"
          : "Unexpected API response — see suggested_action and `--verbose` for detail";
    return {
      checkId: "auth.oauth-health",
      status: "fail",
      detail: `HTTP ${String(error.status)}`,
      suggestedAction: action,
      evidence: { status_code: error.status },
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    checkId: "auth.oauth-health",
    status: "fail",
    detail: `network or transport error: ${message}`,
    suggestedAction: "Check network connectivity to Qonto API host (corporate proxy / firewall / DNS)",
  };
}
