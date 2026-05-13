// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { QontoApiError } from "../../http-client.js";
import { getOrganization } from "../../services/organization.js";
import type { DiagnosticCheck, DiagnosticResult } from "../types.js";

/**
 * Probes api-key authentication via `GET /v2/organization` against the
 * configured endpoint.
 *
 * Uses the mode-pinned api-key client built in `clients.ts` (no OAuth
 * fallback) so a 401/403 here unambiguously means the api-key itself
 * is rejected.
 */
export const apiKeyHealthCheck: DiagnosticCheck = {
  id: "auth.api-key-health",
  name: "API key health",
  kind: "live",
  requiresAuth: "api-key",
  requiresStagingToken: false,
  redactionFields: ["status_code"],
  run: async (ctx): Promise<DiagnosticResult> => {
    if (ctx.apiKeyClient === undefined) {
      return {
        checkId: "auth.api-key-health",
        status: "skip",
        detail: "api-key not configured",
        suggestedAction: null,
      };
    }
    try {
      await getOrganization(ctx.apiKeyClient);
      return {
        checkId: "auth.api-key-health",
        status: "ok",
        detail: "200 OK",
        suggestedAction: null,
        evidence: { status_code: 200 },
      };
    } catch (error) {
      return apiKeyFailureResult(error);
    }
  },
};

function apiKeyFailureResult(error: unknown): DiagnosticResult {
  if (error instanceof QontoApiError) {
    const action =
      error.status === 401 || error.status === 403
        ? "API key was rejected — verify `api-key.organization-slug` and `api-key.secret-key` in your config"
        : error.status >= 500
          ? "Qonto upstream issue — retry shortly; if persistent, check https://status.qonto.com"
          : "Unexpected API response — see suggested_action and `--verbose` for detail";
    return {
      checkId: "auth.api-key-health",
      status: "fail",
      detail: `HTTP ${String(error.status)}`,
      suggestedAction: action,
      evidence: { status_code: error.status },
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    checkId: "auth.api-key-health",
    status: "fail",
    detail: `network or transport error: ${message}`,
    suggestedAction: "Check network connectivity to Qonto API host (corporate proxy / firewall / DNS)",
  };
}
