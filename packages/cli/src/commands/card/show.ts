// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { type Card, getCard } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

function toTableRow(card: Card): Record<string, unknown> {
  return {
    id: card.id,
    nickname: card.nickname,
    last_digits: card.last_digits,
    status: card.status,
    card_level: card.card_level,
    card_type: card.card_type,
    holder_id: card.holder_id,
  };
}

export function registerCardShowCommand(parent: Command): void {
  const show = parent.command("show <id>").description("Show card details");
  addInheritableOptions(show);
  show.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const card = await getCard(client, id);

    const data = opts.output === "table" || opts.output === "csv" ? [toTableRow(card)] : card;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
