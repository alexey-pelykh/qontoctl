// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { AuthPreference } from "@qontoctl/core";

/**
 * Supported output formats for CLI commands.
 */
export type OutputFormat = "table" | "json" | "yaml" | "csv";

/**
 * All valid output format values, used for Commander choices validation.
 */
export const OUTPUT_FORMATS: readonly OutputFormat[] = ["table", "json", "yaml", "csv"] as const;

/**
 * Global CLI options parsed from Commander.
 */
export interface GlobalOptions {
  /**
   * Explicit path to a YAML config file (any filename — `.qontoctl.yaml` is the
   * default name when discovered via env/profile/home, but any path is accepted
   * here). Highest-priority resolver input — overrides {@link profile} and the
   * `QONTOCTL_CONFIG_FILE` env var. When both `--config` and `--profile` are
   * supplied, `--config` wins for FILE selection; a warning is emitted on stderr
   * if the resolved paths disagree, and the profile is preserved so
   * `QONTOCTL_<PROFILE>_*` env-var overrides continue to apply.
   */
  readonly config?: string | undefined;
  readonly profile?: string | undefined;
  readonly output: OutputFormat;
  readonly verbose?: true | undefined;
  readonly debug?: true | undefined;
  /**
   * SCA method preference (`X-Qonto-2fa-Preference` header). Hidden flag for
   * advanced/testing use; in production, leave unset and let Qonto apply its
   * default. See `docs/sandbox-testing.md`.
   */
  readonly scaMethod?: string | undefined;
  /**
   * Sandbox-only auto-approve preference for SCA mock-decision. Values:
   * `"allow"` | `"deny"`. Hidden flag for sandbox testing — rejected in
   * production paths (no staging-token). When unset and the sandbox mock SCA
   * path is active (staging-token + resolved `sca.method === "mock"`),
   * auto-defaults to `"allow"` so sandbox writes complete in a single CLI
   * invocation without external `sca-session mock-decision` orchestration.
   * Commander's `.choices(["allow", "deny"])` validates input at parse time.
   * See `docs/sandbox-testing.md`.
   */
  readonly scaAutoApprove?: "allow" | "deny" | undefined;
  /**
   * Auth precedence preference (`--auth` flag), one of `api-key`,
   * `api-key-first`, `oauth`, `oauth-first`. Highest-priority preference input —
   * overrides `QONTOCTL_AUTH` env var and `auth.preference` config field. When
   * unset, falls back to env > config > built-in default (`oauth-first`).
   * See [#523](https://github.com/alexey-pelykh/qontoctl/issues/523).
   */
  readonly auth?: AuthPreference | undefined;
}

/**
 * Pagination options parsed from Commander.
 */
export interface PaginationOptions {
  readonly page?: number | undefined;
  readonly perPage?: number | undefined;
  readonly paginate: boolean;
}

/**
 * Write operation options parsed from Commander.
 */
export interface WriteOptions {
  readonly idempotencyKey?: string | undefined;
}
