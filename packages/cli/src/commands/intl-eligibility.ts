// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getIntlEligibility } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions } from "../options.js";

export function registerIntlEligibilityCommand(program: Command): void {
  const intl =
    program.commands.find((c) => c.name() === "intl") ??
    program.command("intl").description("International operations");

  const eligibility = intl.command("eligibility").description("Check international transfer eligibility");
  addInheritableOptions(eligibility);
  eligibility.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const result = await getIntlEligibility(client);

    const data =
      opts.output === "table" || opts.output === "csv"
        ? [
            {
              eligible: String(result.eligible),
              ...(result.reason !== undefined ? { reason: result.reason } : {}),
            },
          ]
        : result;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
