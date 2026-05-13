// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { AuthPreference, QontoctlConfig } from "../config/types.js";
import type { HttpClient } from "../http-client.js";

/**
 * Outcome of a single diagnostic check.
 *
 * Stable contract — see ADR-DIAG-7 in `docs/designs/qontoctl-diagnose.md`.
 */
export type CheckStatus = "ok" | "warn" | "fail" | "skip";

/**
 * Whether a check requires a network call (`live`) or is purely
 * configuration-based (`static`).
 */
export type CheckKind = "static" | "live";

/**
 * Authentication requirement of a check.
 *
 * - `none` — no auth needed (static checks)
 * - `api-key` — requires an api-key client
 * - `oauth` — requires an OAuth client
 * - `either` — runs against whichever client is available (api-key preferred)
 */
export type CheckAuth = "none" | "api-key" | "oauth" | "either";

/**
 * One atomic diagnostic.
 *
 * New checks are added by appending to the registry array — no orchestration
 * changes needed.
 */
export interface DiagnosticCheck {
  /** Stable string in `domain.check` form (e.g., `auth.oauth-health`). */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  readonly kind: CheckKind;
  readonly requiresAuth: CheckAuth;
  readonly requiresStagingToken: boolean;
  /**
   * Whitelisted field names allowed through to `result.evidence`. Any other
   * fields the check populates are stripped during redaction. See
   * `redaction.ts` for the whitelist semantics.
   */
  readonly redactionFields: readonly string[];
  /**
   * When `true` and this check returns `status: "fail"`, all subsequent
   * `live` checks in the registry are skipped with `previous-fatal-failure`.
   * Static checks continue to run regardless.
   *
   * Set on `config.resolution` and `auth.credentials-present`.
   */
  readonly cascadeOnFail?: boolean;
  run(ctx: DiagnoseContext): Promise<DiagnosticResult>;
}

/**
 * Outcome of one check's execution.
 */
export interface DiagnosticResult {
  readonly checkId: string;
  readonly status: CheckStatus;
  /** Short human-readable detail string. Subject to global tripwire scrub. */
  readonly detail: string;
  /** Concrete next-step suggestion, or `null` when no action is needed. */
  readonly suggestedAction: string | null;
  /**
   * Optional structured evidence (redacted via the check's
   * `redactionFields` whitelist). Surfaces in JSON output; the table
   * renderer ignores it unless `--verbose` is set.
   */
  readonly evidence?: Record<string, unknown>;
  /** Wall-clock latency in milliseconds; populated for `live` checks. */
  readonly latencyMs?: number;
}

/**
 * Aggregate output of a `diagnose` run.
 */
export interface DiagnosticReport {
  readonly schemaVersion: "1.0";
  readonly qontoctlVersion: string;
  readonly profile: string;
  readonly authMode: AuthPreference;
  /** Absolute path of the loaded config file, or `"<env>"` when env-only. */
  readonly configPath: string;
  readonly stagingTokenPresent: boolean;
  readonly results: readonly DiagnosticResult[];
  readonly summaryCounts: SummaryCounts;
  /** ISO-8601 timestamp, or the literal string `"<frozen>"` for tests. */
  readonly capturedAt: string;
}

/**
 * Per-status counts, plus a `total` rollup. Always present even when zero so
 * the JSON output shape is stable.
 */
export interface SummaryCounts {
  readonly ok: number;
  readonly warn: number;
  readonly fail: number;
  readonly skip: number;
  readonly total: number;
}

/**
 * Per-run state passed to every check. Built once by `runDiagnose`'s caller
 * (the CLI command or MCP tool) before invoking the runner.
 */
export interface DiagnoseContext {
  readonly config: QontoctlConfig;
  readonly profile: string;
  readonly configPath: string | undefined;
  readonly authMode: AuthPreference;
  readonly endpoint: string;
  readonly stagingTokenPresent: boolean;
  readonly qontoctlVersion: string;
  /**
   * When `true`, the report's `capturedAt` becomes the literal string
   * `"<frozen>"` and per-check `latencyMs` is omitted, enabling
   * byte-identical reproducibility for golden-output tests.
   */
  readonly frozenTimestamp: boolean;
  readonly apiKeyClient: HttpClient | undefined;
  readonly oauthClient: HttpClient | undefined;
  /**
   * Mutable per-run cache for cross-check memoization (e.g., `org.metadata`
   * caches the fetched `Organization` so `org.bank-accounts-count` reads it
   * without a second HTTP call).
   *
   * Keys are stable namespaced strings; values are unknown. Checks must
   * narrow types at the read site.
   */
  readonly cache: Map<string, unknown>;
}
