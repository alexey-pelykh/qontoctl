// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { whitelistEvidence } from "./redaction.js";
import type { CheckAuth, DiagnoseContext, DiagnosticCheck, DiagnosticResult } from "./types.js";

/**
 * Sequentially execute checks against a context, applying:
 *
 * - Cascading skip when a `cascadeOnFail` check returns `fail` — every
 *   subsequent `live` check is short-circuited with
 *   `previous-fatal-failure`. Static checks always run, so users still see
 *   `host-routing` etc. even when config could not be loaded.
 * - Auth-aware skip when the active context has no client matching the
 *   check's `requiresAuth`.
 * - Staging-token gate when `requiresStagingToken` is set.
 * - Per-check `latencyMs` capture for live checks.
 * - Per-check `whitelistEvidence` redaction.
 *
 * Catches any exception thrown by `check.run()` and converts it to a
 * `fail` result with a generic "report a bug" suggested action — one
 * misbehaving check never aborts the whole run.
 */
export async function runChecks(
  registry: readonly DiagnosticCheck[],
  ctx: DiagnoseContext,
): Promise<readonly DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  let cascadeSkip = false;

  for (const check of registry) {
    if (cascadeSkip && check.kind === "live") {
      results.push({
        checkId: check.id,
        status: "skip",
        detail: "skipped due to previous fatal failure",
        suggestedAction: null,
      });
      continue;
    }

    if (check.requiresStagingToken && !ctx.stagingTokenPresent) {
      results.push({
        checkId: check.id,
        status: "skip",
        detail: "staging-token not configured",
        suggestedAction: null,
      });
      continue;
    }

    if (!authAvailable(check.requiresAuth, ctx)) {
      results.push({
        checkId: check.id,
        status: "skip",
        detail: skipDetailForAuth(check.requiresAuth),
        suggestedAction: null,
      });
      continue;
    }

    const start = Date.now();
    let raw: DiagnosticResult;
    try {
      raw = await check.run(ctx);
    } catch (error) {
      raw = {
        checkId: check.id,
        status: "fail",
        detail: `internal error: ${error instanceof Error ? error.message : String(error)}`,
        suggestedAction: "Report this as a bug at https://github.com/alexey-pelykh/qontoctl/issues",
      };
    }

    const withLatency =
      check.kind === "live" && raw.latencyMs === undefined && !ctx.frozenTimestamp
        ? { ...raw, latencyMs: Date.now() - start }
        : raw;

    const redactedEvidence = whitelistEvidence(withLatency.evidence, check.redactionFields);
    const final: DiagnosticResult =
      redactedEvidence === undefined ? omitEvidence(withLatency) : { ...withLatency, evidence: redactedEvidence };

    if (check.cascadeOnFail === true && final.status === "fail") {
      cascadeSkip = true;
    }

    results.push(final);
  }

  return results;
}

function authAvailable(requirement: CheckAuth, ctx: DiagnoseContext): boolean {
  switch (requirement) {
    case "none":
      return true;
    case "api-key":
      return ctx.apiKeyClient !== undefined;
    case "oauth":
      return ctx.oauthClient !== undefined;
    case "either":
      return ctx.apiKeyClient !== undefined || ctx.oauthClient !== undefined;
  }
}

function skipDetailForAuth(requirement: CheckAuth): string {
  switch (requirement) {
    case "none":
      return "no authentication available";
    case "api-key":
      return "api-key authentication not configured";
    case "oauth":
      return "oauth authentication not configured";
    case "either":
      return "no credentials configured";
  }
}

function omitEvidence(result: DiagnosticResult): DiagnosticResult {
  if (result.evidence === undefined) return result;
  return {
    checkId: result.checkId,
    status: result.status,
    detail: result.detail,
    suggestedAction: result.suggestedAction,
    ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
  };
}
