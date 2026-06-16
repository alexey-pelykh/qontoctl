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
  runDiagnose,
  type DiagnoseContext,
} from "@qontoctl/core";
import type { ConfigResolver } from "../server.js";

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
 * in isolation. ADR-DIAG: this independent CLIENT construction is
 * deliberate and is separate from CONFIG resolution, which diagnose now
 * shares with the data tools via {@link ConfigResolver} (#663).
 *
 * @param resolve - The server's single config-resolution authority
 *   ({@link createServer} builds it once from the launch selection). Diagnose
 *   resolves config ONLY through this closure — it holds no selection it could
 *   re-derive — so it cannot diverge from the data-tool `getClient`, which
 *   resolves through the same closure (#663, retiring the #658→#661 bug-class).
 *   An explicit `profile` tool argument is passed through to override the launch
 *   profile for that call; re-resolution per call preserves mid-session
 *   OAuth-token-refresh liveness.
 * @param launchProfile - The profile the server was launched with, used ONLY
 *   for the report's active-profile label (`args.profile ?? launchProfile`).
 *   It is display metadata, not a resolution input — surfacing the launch
 *   profile makes a missing-profile situation obvious in the output (#658).
 */
export function registerDiagnoseTools(server: McpServer, resolve: ConfigResolver, launchProfile?: string): void {
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
        // Resolve through the server's single authority — the SAME closure the
        // data tools resolve through (#663). An explicit `profile` tool argument
        // overrides the launch profile for this call.
        const { config, endpoint, path } = await resolve(args.profile);
        // Active profile for the report: the explicit tool argument when given,
        // else the profile the server was launched with, else "default".
        // Surfacing the launch profile makes a missing-profile situation obvious
        // in the output (#658).
        const effectiveProfile = args.profile ?? launchProfile;
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
