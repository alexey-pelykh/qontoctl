// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { updateCardRestrictions, type UpdateCardRestrictionsParams } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

export function registerCardUpdateRestrictionsCommand(parent: Command): void {
  const updateRestrictions = parent
    .command("update-restrictions")
    .description("Update a card's restrictions (active days, merchant categories)")
    .argument("<id>", "Card ID")
    .option("--active-days <days...>", "active weekdays (1=Monday, 7=Sunday)")
    .addOption(
      new Option("--categories <categories...>", "allowed merchant categories (empty to disable)").choices([
        "transport",
        "restaurant_and_bar",
        "food_and_grocery",
        "it_and_electronics",
        "utility",
        "tax",
        "legal_and_accounting",
        "atm",
        "office_supply",
        "hardware_and_equipment",
        "finance",
      ]),
    );
  addInheritableOptions(updateRestrictions);
  addWriteOptions(updateRestrictions);
  updateRestrictions.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<
      GlobalOptions & WriteOptions & { activeDays?: string[] | undefined; categories?: string[] | undefined }
    >(cmd);
    const client = await createClient(opts);

    const params: UpdateCardRestrictionsParams = {
      ...(opts.activeDays !== undefined ? { active_days: opts.activeDays.map(Number) } : {}),
      ...(opts.categories !== undefined ? { categories: opts.categories } : {}),
    };

    const card = await executeWithCliSca(
      client,
      ({ scaSessionToken, idempotencyKey }) =>
        updateCardRestrictions(client, id, params, {
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
              active_days: card.active_days.join(","),
              categories: card.categories.join(","),
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
