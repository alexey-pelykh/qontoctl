// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { ResolveOptions } from "@qontoctl/core";

const CONFIG_FILE_ENV = "QONTOCTL_CONFIG_FILE";

/**
 * Build the `path` portion of {@link ResolveOptions} for the MCP server's
 * config load, sourced from the `QONTOCTL_CONFIG_FILE` env var.
 *
 * The MCP server has no CLI flags, so the env var is its only mechanism for
 * pointing at a non-default config file (CI, multi-config dev workflows,
 * agent-driven setups). Reading the env explicitly at the MCP layer — and
 * passing it through as `path` — makes three properties true:
 *
 *  1. **Symmetry with the CLI**: `qontoctl --config <path>` and
 *     `QONTOCTL_CONFIG_FILE=<path> qontoctl mcp` route through the same
 *     `path`-option codepath in core's resolver.
 *  2. **Startup capture**: the config path is frozen at MCP startup; later
 *     mutations to `process.env.QONTOCTL_CONFIG_FILE` cannot redirect
 *     subsequent loads inside the running server.
 *  3. **Self-evident intent**: the MCP bootstrap reads as
 *     `resolveConfig(buildMcpResolveOptions())` rather than relying on
 *     core's implicit `process.env` fallback.
 *
 * Empty string is treated as "not set" — typically arises from
 * `QONTOCTL_CONFIG_FILE="$UNSET_VAR"` shell expansion, where the variable
 * is technically present but carries no path. Without this guard, callers
 * could silently load the wrong file.
 *
 * @param env - Override the env source (testing). Defaults to `process.env`.
 * @returns `{ path }` when the env var is set to a non-empty string;
 *   `undefined` otherwise. Pass directly to `resolveConfig` — the resolver
 *   accepts `undefined` and falls back to its home/profile defaults.
 */
export function buildMcpResolveOptions(
  env?: Record<string, string | undefined>,
): Pick<ResolveOptions, "path"> | undefined {
  // Explicit cast at the env-source boundary — documents intent that `process.env`
  // is consumed as a `Record<string, string | undefined>`. typescript-eslint 8.59
  // sees this as redundant given NodeJS.ProcessEnv's index signature, but the
  // explicit form is preserved for readers tracing the env-source contract.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const source = env ?? (process.env as Record<string, string | undefined>);
  const configPath = source[CONFIG_FILE_ENV];
  if (configPath === undefined || configPath === "") {
    return undefined;
  }
  return { path: configPath };
}
