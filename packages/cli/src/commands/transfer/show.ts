// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getTransfer } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

export function registerTransferShowCommand(parent: Command): void {
  const show = parent.command("show <id>").description("Show SEPA transfer details");
  addInheritableOptions(show);
  show.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const transfer = await getTransfer(client, id);

    process.stdout.write(formatOutput(transfer, opts.output) + "\n");
  });
}
