// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { lockCard, unlockCard, type Card } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

function formatCard(card: Card, output: string): unknown {
  if (output === "json" || output === "yaml") return card;
  return [{ id: card.id, nickname: card.nickname, status: card.status }];
}

export function registerCardLockCommand(parent: Command): void {
  const lock = parent.command("lock").description("Lock a card").argument("<id>", "Card ID");
  addInheritableOptions(lock);
  addWriteOptions(lock);
  lock.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions>(cmd);
    const client = await createClient(opts);

    const card = await executeWithCliSca(
      client,
      ({ scaSessionToken, idempotencyKey }) =>
        lockCard(client, id, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    process.stdout.write(formatOutput(formatCard(card, opts.output), opts.output) + "\n");
  });
}

export function registerCardUnlockCommand(parent: Command): void {
  const unlock = parent.command("unlock").description("Unlock a card").argument("<id>", "Card ID");
  addInheritableOptions(unlock);
  addWriteOptions(unlock);
  unlock.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions>(cmd);
    const client = await createClient(opts);

    const card = await executeWithCliSca(
      client,
      ({ scaSessionToken, idempotencyKey }) =>
        unlockCard(client, id, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    process.stdout.write(formatOutput(formatCard(card, opts.output), opts.output) + "\n");
  });
}
