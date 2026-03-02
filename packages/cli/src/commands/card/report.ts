// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { reportCardLost, reportCardStolen, type Card } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

function formatCard(card: Card, output: string): unknown {
  if (output === "json" || output === "yaml") return card;
  return [{ id: card.id, nickname: card.nickname, status: card.status }];
}

export function registerCardReportLostCommand(parent: Command): void {
  const reportLost = parent
    .command("report-lost")
    .description("Report a physical card as lost")
    .argument("<id>", "Card ID")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(reportLost);
  addWriteOptions(reportLost);
  reportLost.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { yes?: true | undefined }>(cmd);
    const client = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to report card ${id} as lost. This action is irreversible. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    const card = await executeWithCliSca(
      client,
      (scaSessionToken) =>
        reportCardLost(client, id, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    process.stdout.write(formatOutput(formatCard(card, opts.output), opts.output) + "\n");
  });
}

export function registerCardReportStolenCommand(parent: Command): void {
  const reportStolen = parent
    .command("report-stolen")
    .description("Report a physical card as stolen")
    .argument("<id>", "Card ID")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(reportStolen);
  addWriteOptions(reportStolen);
  reportStolen.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { yes?: true | undefined }>(cmd);
    const client = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(
        `About to report card ${id} as stolen. This action is irreversible. Use --yes to confirm.\n`,
      );
      process.exitCode = 1;
      return;
    }

    const card = await executeWithCliSca(
      client,
      (scaSessionToken) =>
        reportCardStolen(client, id, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    process.stdout.write(formatOutput(formatCard(card, opts.output), opts.output) + "\n");
  });
}
