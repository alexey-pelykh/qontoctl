// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getEInvoicingSettings } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions } from "../options.js";

/**
 * Register the `einvoicing` command group on the given program.
 */
export function registerEInvoicingCommands(program: Command): void {
  const einvoicing = program.command("einvoicing").description("E-invoicing operations");

  const settings = einvoicing.command("settings").description("Show e-invoicing settings");
  addInheritableOptions(settings);
  settings.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);
    const einvoicingSettings = await getEInvoicingSettings(client);

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? einvoicingSettings
        : [
            {
              sending_status: einvoicingSettings.sending_status,
              receiving_status: einvoicingSettings.receiving_status,
            },
          ];

    const output = formatOutput(data, opts.output);
    process.stdout.write(output + "\n");
  });
}
