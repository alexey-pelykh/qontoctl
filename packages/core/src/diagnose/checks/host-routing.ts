// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { API_BASE_URL, SANDBOX_BASE_URL } from "../../constants.js";
import type { DiagnosticCheck, DiagnosticResult } from "../types.js";

/**
 * Cross-checks the resolved API endpoint against the staging-token
 * presence to detect mis-configurations:
 *
 * - staging-token present + production endpoint → `warn` (staging-token
 *   without sandbox routing means a production write would be attempted
 *   even though the user thought they were in sandbox)
 * - no staging-token + sandbox endpoint → `warn` (config explicitly
 *   targeted sandbox without the corresponding token; sandbox will
 *   reject the request)
 *
 * AC scenario 4 verifies the first variant.
 */
export const hostRoutingCheck: DiagnosticCheck = {
  id: "routing.host-target",
  name: "Host routing",
  kind: "static",
  requiresAuth: "none",
  requiresStagingToken: false,
  redactionFields: ["endpoint", "expected", "staging_token_present", "mismatch"],
  run: (ctx): Promise<DiagnosticResult> => {
    const expected = ctx.stagingTokenPresent ? SANDBOX_BASE_URL : API_BASE_URL;
    const mismatch = ctx.endpoint !== expected;
    if (mismatch) {
      const detail = ctx.stagingTokenPresent
        ? `routing mismatch: staging-token present but endpoint is ${ctx.endpoint}`
        : `routing mismatch: no staging-token but endpoint is ${ctx.endpoint}`;
      const action = ctx.stagingTokenPresent
        ? `Expected sandbox host (${SANDBOX_BASE_URL}). Remove the \`endpoint\` override or remove the staging-token.`
        : `Expected production host (${API_BASE_URL}). Remove the \`endpoint\` override or set \`oauth.staging-token\` to route to sandbox.`;
      return Promise.resolve({
        checkId: "routing.host-target",
        status: "warn",
        detail,
        suggestedAction: action,
        evidence: {
          endpoint: ctx.endpoint,
          expected,
          staging_token_present: ctx.stagingTokenPresent,
          mismatch: true,
        },
      });
    }
    const detail = ctx.stagingTokenPresent ? "sandbox host (staging-token present)" : "production host";
    return Promise.resolve({
      checkId: "routing.host-target",
      status: "ok",
      detail,
      suggestedAction: null,
      evidence: {
        endpoint: ctx.endpoint,
        expected,
        staging_token_present: ctx.stagingTokenPresent,
        mismatch: false,
      },
    });
  },
};
