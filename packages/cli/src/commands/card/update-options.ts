// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { updateCardOptions, type UpdateCardOptionsParams } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

export function registerCardUpdateOptionsCommand(parent: Command): void {
  const updateOpts = parent
    .command("update-options")
    .description("Update a card's options (ATM, NFC, online, foreign)")
    .argument("<id>", "Card ID")
    .addOption(new Option("--atm-option <bool>", "enable ATM withdrawals (true/false)").makeOptionMandatory())
    .addOption(new Option("--nfc-option <bool>", "enable contactless payments (true/false)").makeOptionMandatory())
    .addOption(new Option("--online-option <bool>", "enable online payments (true/false)").makeOptionMandatory())
    .addOption(
      new Option("--foreign-option <bool>", "enable international payments (true/false)").makeOptionMandatory(),
    );
  addInheritableOptions(updateOpts);
  addWriteOptions(updateOpts);
  updateOpts.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<
      GlobalOptions &
        WriteOptions & {
          atmOption: string;
          nfcOption: string;
          onlineOption: string;
          foreignOption: string;
        }
    >(cmd);
    const client = await createClient(opts);

    const params: UpdateCardOptionsParams = {
      atm_option: opts.atmOption === "true",
      nfc_option: opts.nfcOption === "true",
      online_option: opts.onlineOption === "true",
      foreign_option: opts.foreignOption === "true",
    };

    const card = await executeWithCliSca(
      client,
      ({ scaSessionToken, idempotencyKey }) =>
        updateCardOptions(client, id, params, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    const data: unknown =
      opts.output === "json" || opts.output === "yaml"
        ? card
        : [
            {
              id: card.id,
              nickname: card.nickname,
              atm_option: card.atm_option,
              nfc_option: card.nfc_option,
              online_option: card.online_option,
              foreign_option: card.foreign_option,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
