// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { DiagnosticCheck, DiagnosticResult } from "../types.js";

/**
 * Reports the OAuth scopes recorded in config (config-mirror per
 * ADR-DIAG-3 — Qonto exposes no stable token-introspection endpoint,
 * so the configured scopes ARE the authoritative truth of what the
 * consent flow granted).
 *
 * Status semantics:
 * - `ok` — at least one scope present
 * - `warn` — `oauth` configured but `scopes` field is empty / absent
 *   (the user has likely not run `qontoctl auth setup` yet)
 * - `skip` — no oauth configured (handled by the runner via
 *   `requiresAuth: "oauth"`)
 */
export const scopesCheck: DiagnosticCheck = {
  id: "auth.scopes",
  name: "OAuth scopes",
  kind: "static",
  requiresAuth: "oauth",
  requiresStagingToken: false,
  redactionFields: ["scopes", "scopes_count"],
  run: (ctx): Promise<DiagnosticResult> => {
    const scopes = ctx.config.oauth?.scopes ?? [];
    if (scopes.length === 0) {
      return Promise.resolve({
        checkId: "auth.scopes",
        status: "warn",
        detail: "no scopes configured",
        suggestedAction: "Run `qontoctl auth setup` to select OAuth scopes",
        evidence: { scopes: [], scopes_count: 0 },
      });
    }
    return Promise.resolve({
      checkId: "auth.scopes",
      status: "ok",
      detail: `${String(scopes.length)} scope${scopes.length === 1 ? "" : "s"} granted`,
      suggestedAction: null,
      evidence: { scopes: [...scopes], scopes_count: scopes.length },
    });
  },
};
