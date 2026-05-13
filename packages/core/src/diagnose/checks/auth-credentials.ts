// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { DiagnosticCheck, DiagnosticResult } from "../types.js";

/**
 * Reports which credential types are configured (api-key, OAuth, both, or
 * neither) and the resolved auth-precedence mode.
 *
 * Returns `fail` only when no credentials are configured at all; the
 * runner cascades skips to all subsequent live checks in that case. A
 * single-credential config (api-key only OR oauth only) is normal — no
 * warning is emitted, since the user's `--auth` precedence governs which
 * one is primary.
 */
export const authCredentialsCheck: DiagnosticCheck = {
  id: "auth.credentials-present",
  name: "Auth credentials present",
  kind: "static",
  requiresAuth: "none",
  requiresStagingToken: false,
  cascadeOnFail: true,
  redactionFields: ["has_api_key", "has_oauth", "auth_mode"],
  run: (ctx): Promise<DiagnosticResult> => {
    const hasApiKey = ctx.config.apiKey !== undefined;
    const hasOAuth = ctx.config.oauth !== undefined;

    if (!hasApiKey && !hasOAuth) {
      return Promise.resolve({
        checkId: "auth.credentials-present",
        status: "fail",
        detail: "no credentials configured",
        suggestedAction: "Add `api-key` and/or `oauth` to your qontoctl config; see docs/configuration.md",
        evidence: {
          has_api_key: false,
          has_oauth: false,
          auth_mode: ctx.authMode,
        },
      });
    }

    const summary = hasApiKey && hasOAuth ? "api-key + oauth configured" : hasApiKey ? "api-key only" : "oauth only";
    return Promise.resolve({
      checkId: "auth.credentials-present",
      status: "ok",
      detail: summary,
      suggestedAction: null,
      evidence: {
        has_api_key: hasApiKey,
        has_oauth: hasOAuth,
        auth_mode: ctx.authMode,
      },
    });
  },
};
