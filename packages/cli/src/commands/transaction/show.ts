// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { getTransaction } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

interface TransactionShowOptions extends GlobalOptions {
  readonly include?: string[] | undefined;
}

export function registerTransactionShowCommand(parent: Command): void {
  const show = parent
    .command("show <id>")
    .description("Show transaction details")
    .addOption(
      new Option("--include <resources...>", "include nested resources").choices([
        "labels",
        "attachments",
        "vat_details",
      ]),
    );
  addInheritableOptions(show);
  show.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<TransactionShowOptions>(cmd);
    const client = await createClient(opts);

    const transaction = await getTransaction(client, id, opts.include);

    process.stdout.write(formatOutput(transaction, opts.output) + "\n");
  });
}
