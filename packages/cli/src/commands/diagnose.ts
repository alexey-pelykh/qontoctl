// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { createRequire } from "node:module";
import type { Command } from "commander";
import { Option } from "commander";
import {
  AUTH_PREFERENCES,
  buildDiagnoseClients,
  buildRedactionContext,
  DEFAULT_AUTH_PREFERENCE,
  resolveAuthPreference,
  resolveConfig,
  runDiagnose,
  type DiagnoseContext,
} from "@qontoctl/core";
import { buildResolveOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions } from "../options.js";
import { exitCodeFor, formatDiagnoseJson, formatDiagnoseTable } from "./diagnose-format.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version: string };

interface DiagnoseOptions extends GlobalOptions {
  readonly diagnoseOutput?: "table" | "json";
  readonly ascii?: boolean;
  readonly frozenTimestamp?: boolean;
}

/**
 * Register the `diagnose` command on the program.
 *
 * The command:
 * 1. Resolves config via the standard precedence chain.
 * 2. Builds mode-pinned clients (api-key + oauth) so health checks for
 *    each credential mode run in isolation.
 * 3. Constructs a {@link DiagnoseContext} and invokes `runDiagnose`.
 * 4. Renders to table (TTY default) or JSON (non-TTY default; explicit via
 *    `--diagnose-output json`).
 * 5. Exits with the ADR-DIAG-7 code: 0 / 1 / 2. Fatal init errors (config
 *    unreadable, etc.) propagate to the global error handler which exits
 *    with the standard CLI error code.
 *
 * Note: the `--diagnose-output` flag is named distinctly from the global
 * `--output` (table/json/yaml/csv) because diagnose's output shape
 * (a structured report, not a list of records) is fundamentally different
 * from the other commands; mixing them would be surprising. Diagnose
 * deliberately offers only `table` and `json` per design §8a.
 */
export function registerDiagnoseCommand(program: Command): void {
  const diagnose = program
    .command("diagnose")
    .description(
      "Run a read-only healthcheck against the configured profile (first command to try when something doesn't work)",
    );
  diagnose
    .addOption(
      new Option("--config <path>", "path to configuration file (overrides --profile and QONTOCTL_CONFIG_FILE)"),
    )
    .addOption(new Option("-p, --profile <name>", "configuration profile to use"))
    .addOption(
      new Option("--diagnose-output <format>", "diagnose-specific output format")
        .choices(["table", "json"])
        .default(undefined),
    )
    .addOption(new Option("--ascii", "use ASCII fallback markers instead of unicode (✓/⚠/✗/—)"))
    .addOption(
      new Option(
        "--frozen-timestamp",
        'emit captured_at: "<frozen>" and omit per-check latencyMs for byte-identical reproducibility',
      ).hideHelp(),
    )
    .addOption(new Option("--verbose", "include suggested_action and evidence under each check"))
    .addOption(new Option("--debug", "alias for --verbose plus underlying HTTP details").hideHelp())
    .addOption(
      new Option(
        "--auth <mode>",
        `authentication precedence (default: "${DEFAULT_AUTH_PREFERENCE}"); *-first modes fall back when primary is unavailable`,
      ).choices([...AUTH_PREFERENCES]),
    );

  diagnose.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<DiagnoseOptions>(cmd);
    await runDiagnoseCommand(opts);
  });
}

/**
 * Execute the diagnose command body. Extracted so the command's action is
 * a thin wrapper and the body is testable in isolation.
 */
export async function runDiagnoseCommand(opts: DiagnoseOptions): Promise<void> {
  const { config, endpoint, warnings, path } = await resolveConfig(buildResolveOptions(opts));

  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }

  const authMode = resolveAuthPreference(config, opts.auth);
  const stagingTokenPresent = config.oauth?.stagingToken !== undefined;
  const clients = buildDiagnoseClients(config, endpoint);

  const ctx: DiagnoseContext = {
    config,
    profile: opts.profile ?? "default",
    configPath: path,
    authMode,
    endpoint,
    stagingTokenPresent,
    qontoctlVersion: packageJson.version,
    frozenTimestamp: opts.frozenTimestamp === true,
    apiKeyClient: clients.apiKey,
    oauthClient: clients.oauth,
    cache: new Map(),
  };

  const report = await runDiagnose(ctx);

  const redaction = buildRedactionContext(config);
  const wantsJson = opts.diagnoseOutput === "json" || (opts.diagnoseOutput === undefined && !process.stdout.isTTY);
  const verbose = opts.verbose === true || opts.debug === true;
  const { rendered, leaks } = wantsJson
    ? formatDiagnoseJson(report, { redaction })
    : formatDiagnoseTable(report, { ascii: opts.ascii === true, verbose, redaction });

  if (leaks.length > 0 && verbose) {
    process.stderr.write(`diagnose: tripwire scrubbed ${String(leaks.length)} leak(s): ${leaks.join(", ")}\n`);
  }

  process.stdout.write(rendered + "\n");
  process.exitCode = exitCodeFor(report);
}
