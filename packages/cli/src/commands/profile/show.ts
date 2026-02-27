// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { loadConfigFile, validateConfig } from "@qontoctl/core";
import { formatOutput } from "../../formatters/index.js";
import type { GlobalOptions } from "../../options.js";

/**
 * Register the `profile show <name>` subcommand.
 */
export function registerShowCommand(parent: Command): void {
  parent
    .command("show <name>")
    .description("show profile details with secrets redacted")
    .action(async (name: string, _options: unknown, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals<GlobalOptions>();
      await showProfile(name, globalOpts);
    });
}

async function showProfile(name: string, options: GlobalOptions): Promise<void> {
  const { raw, path } = await loadConfigFile({ profile: name });

  if (raw === undefined) {
    console.error(`Profile "${name}" not found.`);
    process.exitCode = 1;
    return;
  }

  const { config, warnings, errors } = validateConfig(raw);

  for (const warning of warnings) {
    console.error(`Warning: ${warning}`);
  }

  for (const error of errors) {
    console.error(`Error: ${error}`);
  }

  if (errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  const details = {
    name,
    path: path ?? "unknown",
    organization_slug: config.apiKey?.organizationSlug ?? "",
    secret_key: redactSecret(config.apiKey?.secretKey ?? ""),
  };

  console.log(formatOutput([details], options.output));
}

/**
 * Redact a secret key, showing only the last 4 characters.
 */
function redactSecret(secret: string): string {
  if (secret.length <= 4) {
    return "****";
  }
  return "****" + secret.slice(-4);
}
