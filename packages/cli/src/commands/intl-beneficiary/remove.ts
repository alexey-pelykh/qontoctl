// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { removeIntlBeneficiary } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface IntlBeneficiaryRemoveOptions extends GlobalOptions, WriteOptions {
  readonly yes?: true | undefined;
}

export function registerIntlBeneficiaryRemoveCommand(parent: Command): void {
  const remove = parent
    .command("remove <id>")
    .description("Remove an international beneficiary")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(remove);
  addWriteOptions(remove);
  remove.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<IntlBeneficiaryRemoveOptions>(cmd);
    const httpClient = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to remove international beneficiary ${id}. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    await executeWithCliSca(
      httpClient,
      async ({ scaSessionToken, idempotencyKey }) =>
        removeIntlBeneficiary(httpClient, id, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ removed: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`International beneficiary ${id} removed.\n`);
    }
  });
}
