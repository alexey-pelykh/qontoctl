// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getOrganization } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import type { GlobalOptions } from "../options.js";

/**
 * Register the `org` command group on the given program.
 */
export function registerOrgCommands(program: Command): void {
  const org = program.command("org").description("Organization operations");

  org
    .command("show")
    .description("Show organization details")
    .action(async () => {
      const opts = program.opts<GlobalOptions>();
      const client = await createClient(opts);
      const organization = await getOrganization(client);

      const data =
        opts.output === "json" || opts.output === "yaml"
          ? organization
          : [
              {
                slug: organization.slug,
                legal_name: organization.legal_name,
                bank_accounts: organization.bank_accounts.length,
              },
            ];

      const output = formatOutput(data, opts.output);
      process.stdout.write(output + "\n");
    });
}
