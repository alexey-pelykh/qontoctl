// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { cancelRecurringTransfer } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface RecurringTransferCancelOptions extends GlobalOptions, WriteOptions {
  readonly yes?: true | undefined;
}

export function registerRecurringTransferCancelCommand(parent: Command): void {
  const cancel = parent
    .command("cancel <id>")
    .description("Cancel a recurring transfer")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(cancel);
  addWriteOptions(cancel);
  cancel.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<RecurringTransferCancelOptions>(cmd);
    const httpClient = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to cancel recurring transfer ${id}. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        cancelRecurringTransfer(httpClient, id, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ canceled: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`Recurring transfer ${id} canceled.\n`);
    }
  });
}
