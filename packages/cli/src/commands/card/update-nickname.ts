// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { updateCardNickname } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

export function registerCardUpdateNicknameCommand(parent: Command): void {
  const updateNick = parent
    .command("update-nickname")
    .description("Update a card's nickname")
    .argument("<id>", "Card ID")
    .addOption(new Option("--nickname <name>", "new nickname (1-40 characters)").makeOptionMandatory());
  addInheritableOptions(updateNick);
  addWriteOptions(updateNick);
  updateNick.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { nickname: string }>(cmd);
    const client = await createClient(opts);

    const card = await executeWithCliSca(
      client,
      (scaSessionToken) =>
        updateCardNickname(client, id, opts.nickname, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    const data: unknown =
      opts.output === "json" || opts.output === "yaml"
        ? card
        : [{ id: card.id, nickname: card.nickname, status: card.status }];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
