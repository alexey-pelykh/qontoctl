// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { createIntlQuote, type IntlQuote } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

interface IntlQuoteCreateOptions extends GlobalOptions {
  readonly currency: string;
  readonly amount: string;
  readonly direction: "send" | "receive";
}

function toTableRow(q: IntlQuote): Record<string, string> {
  return {
    id: q.id,
    source_currency: q.source_currency,
    target_currency: q.target_currency,
    source_amount: String(q.source_amount),
    target_amount: String(q.target_amount),
    rate: String(q.rate),
    fee: `${q.fee_amount} ${q.fee_currency}`,
    expires_at: q.expires_at,
  };
}

export function registerIntlQuoteCreateCommand(parent: Command): void {
  const create = parent
    .command("create")
    .description("Create an international transfer quote with exchange rate")
    .addOption(new Option("--currency <code>", "target currency code").makeOptionMandatory())
    .addOption(new Option("--amount <number>", "amount to send or receive").makeOptionMandatory())
    .addOption(
      new Option("--direction <dir>", "whether amount is to send or receive")
        .choices(["send", "receive"])
        .default("send"),
    );
  addInheritableOptions(create);
  create.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<IntlQuoteCreateOptions>(cmd);
    const client = await createClient(opts);

    const amount = Number(opts.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Invalid amount: "${opts.amount}". Expected a positive number.`);
    }

    const result = await createIntlQuote(client, {
      currency: opts.currency,
      amount,
      direction: opts.direction,
    });

    const data = opts.output === "table" || opts.output === "csv" ? [toTableRow(result)] : result;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
