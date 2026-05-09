// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

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
