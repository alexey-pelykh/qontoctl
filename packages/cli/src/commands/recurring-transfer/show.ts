// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getRecurringTransfer } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

export function registerRecurringTransferShowCommand(parent: Command): void {
  const show = parent.command("show <id>").description("Show recurring transfer details");
  addInheritableOptions(show);
  show.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const recurringTransfer = await getRecurringTransfer(client, id);

    process.stdout.write(formatOutput(recurringTransfer, opts.output) + "\n");
  });
}
