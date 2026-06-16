// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  buildClientFromConfig,
  resolveConfig,
  type ConfigResult,
  type HttpClient,
  type HttpClientLogger,
} from "@qontoctl/core";
import { buildResolveOptions } from "./inherited-options.js";
import type { GlobalOptions } from "./options.js";

/**
 * Build the request/response logger from CLI verbosity flags. Returns
 * `undefined` when neither `--debug` nor `--verbose` is set.
 *
 * The `--debug` data-exposure warning is NOT emitted here — the caller emits it
 * AFTER client construction so it follows any auth-chain-degrade warning on
 * stderr (see {@link buildClientFromGlobalOptions}).
 *
 * Extracted so both `createClient` (CLI commands) and
 * {@link buildClientFromGlobalOptions} (umbrella `qontoctl mcp`) share one
 * definition of the verbosity→logger mapping.
 */
function buildLogger(options: GlobalOptions): HttpClientLogger | undefined {
  if (options.debug === true) {
    return {
      verbose: (msg) => process.stderr.write(`${msg}\n`),
      debug: (msg) => process.stderr.write(`${msg}\n`),
    };
  }
  if (options.verbose === true) {
    return {
      verbose: (msg) => process.stderr.write(`${msg}\n`),
      debug: () => {},
    };
  }
  return undefined;
}

/**
 * Build an authenticated {@link HttpClient} from an already-resolved config and
 * the CLI's global options. The bridge between `GlobalOptions` (CLI/umbrella
 * flags) and core's `buildClientFromConfig` (#663): it maps the flags onto
 * `BuildClientOptions`, wires the debug/verbose logger, and emits the
 * file-level resolve warnings (`result.warnings`, e.g. insecure permissions)
 * plus the construction-time notices (auth-chain degrade, primary→fallback) to
 * stderr.
 *
 * Used by {@link createClient} (CLI commands) AND by the umbrella `qontoctl mcp`
 * entry as the server's `buildClient` — so both surfaces emit identical
 * warnings and honour the same flags. (The standalone `qontoctl-mcp` entry has
 * no `GlobalOptions` and calls core's `buildClientFromConfig` directly with the
 * lean option set.)
 *
 * @throws {ConfigError} / {AuthError} propagated from `buildClientFromConfig`
 *   (the #631 fatal-config guard, no-credentials, invalid api-key).
 */
export function buildClientFromGlobalOptions(result: ConfigResult, options: GlobalOptions): HttpClient {
  for (const warning of result.warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }

  const logger = buildLogger(options);

  const client = buildClientFromConfig(result, {
    ...(options.auth !== undefined ? { authPreference: options.auth } : {}),
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
    ...(options.scaMethod !== undefined ? { scaMethodOverride: options.scaMethod } : {}),
    ...(logger !== undefined ? { logger } : {}),
    onWarning: (message) => process.stderr.write(message),
  });

  // Emitted AFTER construction so the auth-chain-degrade (`selection.warning`)
  // notice that `buildClientFromConfig` emits via `onWarning` precedes it on
  // stderr — preserving the pre-#663 `createClient` ordering for the case where
  // `--debug` and an auth-degrade warning co-occur.
  if (options.debug === true) {
    process.stderr.write(
      "Warning: Debug mode logs full API responses which may include financial data (IBANs, balances). " +
        "Do not use in shared environments.\n",
    );
  }

  return client;
}

/**
 * Create an authenticated {@link HttpClient} from global CLI options.
 *
 * Resolves configuration (`--config` > `QONTOCTL_CONFIG_FILE` env > `--profile`
 * derived path > home default), then builds the fallback-chain client via
 * {@link buildClientFromGlobalOptions}.
 *
 * Auth precedence (governed by the resolved `AuthPreference`: `api-key`,
 * `api-key-first`, `oauth`, `oauth-first` default), the #631 fatal-config guard,
 * SCA-method resolution, and the OAuth/api-key fallback chain all live in core's
 * `buildClientFromConfig` — see its docs for the full semantics. The signature
 * and observable behaviour are unchanged by the #663 extraction.
 */
export async function createClient(options: GlobalOptions): Promise<HttpClient> {
  const result = await resolveConfig(buildResolveOptions(options));
  return buildClientFromGlobalOptions(result, options);
}
