// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { buildClientFromConfig } from "@qontoctl/core";
import { buildMcpResolveOptions } from "./config.js";
import type { BuildClient, CreateServerOptions } from "./server.js";

/**
 * Assemble the {@link CreateServerOptions} for the standalone `qontoctl-mcp`
 * binary: the data-tool `buildClient` factory **and** the `resolveOptions`
 * captured once at startup. {@link createServer} builds ONE resolver from
 * `resolveOptions` that BOTH the data tools and the `diagnose` tool resolve
 * through, so they cannot diverge on which config file to load (#663 — retiring
 * the #658→#661 bug-class).
 *
 * `buildClient` is the lean side of core's shared `buildClientFromConfig`: the
 * standalone binary has no CLI flags, so it wires only the construction-time
 * warning sink — no `--auth` / `--profile` / `--sca-method` override and no
 * debug/verbose logger. (Auth preference still resolves from env > config >
 * built-in default; the #631 fatal-config guard, fallback chain, SCA-method
 * resolution, and staging-token routing all come from the shared helper.) The
 * umbrella `qontoctl mcp` entry passes the full superset via the CLI's
 * `buildClientFromGlobalOptions` instead.
 *
 * **Startup capture + lockstep (#661).** `buildMcpResolveOptions(env)` captures
 * `QONTOCTL_CONFIG_FILE` once. When it is SET at startup, `resolveOptions` is
 * the frozen `{ path }` and the server's resolver pins both the data tools and
 * `diagnose` to it — later `process.env` mutations cannot redirect subsequent
 * loads. When it is UNSET, `resolveOptions` is omitted and the server's resolver
 * live-reads `process.env` on every call (via `resolveConfig`'s
 * `path > QONTOCTL_CONFIG_FILE > profile > home` precedence), so both sides
 * live-read together and stay in lockstep. (Pre-#663 this lockstep had to be
 * re-established at each entry point by threading `resolveOptions` into
 * `diagnose`; #663 makes it structural — the server owns the one resolver.)
 *
 * @param env - Override the env source (testing). Defaults to `process.env`.
 *   Affects only the captured `resolveOptions`; the resolver the server builds
 *   from it also consults core's own `process.env` overlay exactly as in
 *   production.
 */
export function buildStandaloneServerOptions(env?: Record<string, string | undefined>): CreateServerOptions {
  const mcpResolveOptions = buildMcpResolveOptions(env);

  // Lean data-tool client: the shared core assembly with only the warning sink
  // wired. The standalone binary has no CLI flags, so no logger / auth / profile
  // / sca-method overrides are passed; everything else (auth-chain selection,
  // #631 fatal guard, fallback, staging-token, SCA default) lives in the shared
  // buildClientFromConfig — closing the auth-chain duplication with the CLI.
  const buildClient: BuildClient = (result) =>
    buildClientFromConfig(result, { onWarning: (message) => process.stderr.write(message) });

  return {
    buildClient,
    // Thread the startup-frozen selection so the server's resolver pins both the
    // data tools and diagnose to it. Omitted when unset at startup (both sides
    // then live-read — see the lockstep rationale above) (#661).
    ...(mcpResolveOptions !== undefined ? { resolveOptions: mcpResolveOptions } : {}),
  };
}
