// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { discardCard } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

export function registerCardDiscardCommand(parent: Command): void {
  const discard = parent
    .command("discard")
    .description("Discard a card")
    .argument("<id>", "Card ID")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(discard);
  addWriteOptions(discard);
  discard.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { yes?: true | undefined }>(cmd);
    const client = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to discard card ${id}. This action is irreversible. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    const card = await executeWithCliSca(
      client,
      ({ scaSessionToken, idempotencyKey }) =>
        discardCard(client, id, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    const data: unknown =
      opts.output === "json" || opts.output === "yaml"
        ? card
        : [{ id: card.id, nickname: card.nickname, status: card.status }];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
