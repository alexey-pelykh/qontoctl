// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { createRequire } from "node:module";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  applyTripwire,
  buildDiagnoseClients,
  buildRedactionContext,
  DiagnosticReportSchema,
  resolveAuthPreference,
  resolveConfig,
  runDiagnose,
  type DiagnoseContext,
  type ResolveOptions,
} from "@qontoctl/core";
import { buildMcpResolveOptions } from "../config.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version: string };

/**
 * Register the MCP `diagnose` tool.
 *
 * Read-only by design (per ADR-DIAG-5):
 * - Input schema accepts only `profile` (optional). No display flags,
 *   no path arguments — those have no meaning to a programmatic
 *   consumer and could open a privileged-data path.
 * - Output is the same `DiagnosticReport` shape the CLI's JSON mode
 *   produces, validated against `DiagnosticReportSchema` before return.
 * - Global tripwire scrubs the rendered JSON of any stray secret in
 *   `detail` strings before it leaves the process.
 *
 * Builds its own clients independently of any pre-existing
 * `HttpClient` factory — diagnose specifically needs mode-pinned
 * clients (no fallback chain) so it can probe each credential mode
 * in isolation.
 *
 * @param resolveOptions - Base config-resolution selection captured at
 *   server launch (the same `{ path?, profile? }` the data-tool client
 *   factory resolves through). Threaded so diagnose resolves credentials
 *   via the launch `--profile` / `--config` rather than being blind to
 *   them (#658). When omitted (standalone `qontoctl-mcp` — no CLI flags),
 *   diagnose falls back to `QONTOCTL_CONFIG_FILE` via
 *   {@link buildMcpResolveOptions}, matching that entry point's `getClient`.
 *   An explicit `profile` tool argument still overrides the launch profile.
 */
export function registerDiagnoseTools(
  server: McpServer,
  resolveOptions?: Pick<ResolveOptions, "path" | "profile">,
): void {
  server.registerTool(
    "diagnose",
    {
      description:
        "Run a read-only healthcheck against the configured qontoctl profile. Returns a DiagnosticReport with per-check status (ok/warn/fail/skip), detail, and suggested actions. Use this first when something doesn't work.",
      inputSchema: {
        profile: z.string().optional().describe("Configuration profile to use (omit for the default profile)"),
      },
    },
    async (args) => {
      try {
        const { config, endpoint, path } = await resolveProfileConfig(args.profile, resolveOptions);
        // Active profile for the report: the explicit tool argument when
        // given, else the profile the server was launched with (threaded via
        // resolveOptions), else "default". Surfacing the launch profile makes
        // a missing-profile situation obvious in the output (#658).
        const effectiveProfile = args.profile ?? resolveOptions?.profile;
        const ctx = buildContext(effectiveProfile, config, endpoint, path);
        const report = await runDiagnose(ctx);
        const validated = DiagnosticReportSchema.parse(report);
        const redaction = buildRedactionContext(config);
        const json = JSON.stringify(sortKeysDeep(validated), null, 2);
        const { cleaned, leaks } = applyTripwire(json, redaction);
        if (leaks.length > 0) {
          process.stderr.write(`diagnose: tripwire scrubbed ${String(leaks.length)} leak(s): ${leaks.join(", ")}\n`);
        }
        return {
          content: [{ type: "text" as const, text: cleaned }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `diagnose failed to initialize: ${message}` }],
          isError: true,
        };
      }
    },
  );
}

function buildContext(
  profile: string | undefined,
  config: Parameters<typeof buildDiagnoseClients>[0],
  endpoint: string,
  path: string | undefined,
): DiagnoseContext {
  const clients = buildDiagnoseClients(config, endpoint);
  return {
    config,
    profile: profile ?? "default",
    configPath: path,
    authMode: resolveAuthPreference(config),
    endpoint,
    stagingTokenPresent: config.oauth?.stagingToken !== undefined,
    qontoctlVersion: packageJson.version,
    frozenTimestamp: false,
    apiKeyClient: clients.apiKey,
    oauthClient: clients.oauth,
    cache: new Map(),
  };
}

async function resolveProfileConfig(
  profile: string | undefined,
  resolveOptions: Pick<ResolveOptions, "path" | "profile"> | undefined,
) {
  // Base selection: the launch options threaded from the server (umbrella
  // `qontoctl mcp --profile`/`--config`), else the standalone entry point's
  // QONTOCTL_CONFIG_FILE env. Either way diagnose resolves through the SAME
  // base the data-tool client factory uses — that parity is the fix for #658.
  const base = resolveOptions ?? buildMcpResolveOptions();
  return resolveConfig({
    ...(base ?? {}),
    // An explicit tool-call `profile` overrides the launch profile.
    ...(profile !== undefined ? { profile } : {}),
  });
}

/**
 * Recursively sort object keys for stable serialization. Matches the
 * CLI's JSON formatter so the same report renders byte-identically
 * regardless of which surface (CLI `--diagnose-output json` or MCP)
 * emits it. Arrays are preserved in input order.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      result[key] = sortKeysDeep(obj[key]);
    }
    return result;
  }
  return value;
}
