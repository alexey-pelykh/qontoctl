// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Organization } from "../../api-types.js";
import { QontoApiError } from "../../http-client.js";
import { getOrganization } from "../../services/organization.js";
import type { DiagnoseContext, DiagnosticCheck, DiagnosticResult } from "../types.js";

/**
 * Cache key for the fetched `Organization`. The `org.bank-accounts-count`
 * check reads from this slot to avoid a second round-trip.
 */
export const ORGANIZATION_CACHE_KEY = "diagnose.organization";

/**
 * Fetches `GET /v2/organization` via whichever client is available
 * (api-key preferred, falling back to OAuth). Reports the org slug and
 * legal name and caches the response for downstream checks.
 */
export const orgMetadataCheck: DiagnosticCheck = {
  id: "org.metadata",
  name: "Organization metadata",
  kind: "live",
  requiresAuth: "either",
  requiresStagingToken: false,
  redactionFields: ["slug", "legal_name", "bank_accounts_count"],
  run: async (ctx): Promise<DiagnosticResult> => {
    const client = pickClient(ctx);
    if (client === undefined) {
      // Defense-in-depth — runner should have skipped this already.
      return {
        checkId: "org.metadata",
        status: "skip",
        detail: "no credentials configured",
        suggestedAction: null,
      };
    }
    try {
      const org = await getOrganization(client);
      ctx.cache.set(ORGANIZATION_CACHE_KEY, org);
      return {
        checkId: "org.metadata",
        status: "ok",
        detail: `${org.slug} (${org.legal_name})`,
        suggestedAction: null,
        evidence: {
          slug: org.slug,
          legal_name: org.legal_name,
          bank_accounts_count: org.bank_accounts.length,
        },
      };
    } catch (error) {
      return failureResult(error);
    }
  },
};

function pickClient(ctx: DiagnoseContext) {
  return ctx.apiKeyClient ?? ctx.oauthClient;
}

function failureResult(error: unknown): DiagnosticResult {
  if (error instanceof QontoApiError) {
    return {
      checkId: "org.metadata",
      status: "fail",
      detail: `HTTP ${String(error.status)}`,
      suggestedAction:
        error.status >= 500
          ? "Qonto upstream issue — retry shortly; if persistent, check https://status.qonto.com"
          : "Unexpected API response — see `auth.api-key-health` / `auth.oauth-health` for credential status",
      evidence: { status_code: error.status },
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    checkId: "org.metadata",
    status: "fail",
    detail: `network or transport error: ${message}`,
    suggestedAction: "Check network connectivity to Qonto API host",
  };
}

/**
 * Narrow the cached value to `Organization`. The cache is typed `unknown`
 * to keep checks decoupled from each other's schemas, so this guard is
 * what makes the cross-check contract type-safe — without it, an unrelated
 * write to the same key would propagate as a wrong-shape `Organization`
 * and crash a downstream check.
 */
export function readCachedOrganization(ctx: DiagnoseContext): Organization | undefined {
  const cached = ctx.cache.get(ORGANIZATION_CACHE_KEY);
  if (cached === null || typeof cached !== "object") return undefined;
  const obj = cached as Record<string, unknown>;
  if (typeof obj["slug"] !== "string") return undefined;
  if (typeof obj["legal_name"] !== "string") return undefined;
  if (!Array.isArray(obj["bank_accounts"])) return undefined;
  return cached as Organization;
}
