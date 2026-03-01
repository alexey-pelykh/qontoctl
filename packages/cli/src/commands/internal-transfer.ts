// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import type { InternalTransfer } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../options.js";

interface InternalTransferCreateOptions extends GlobalOptions, WriteOptions {
  readonly debitIban: string;
  readonly creditIban: string;
  readonly reference: string;
  readonly amount: string;
  readonly currency: string;
}

function internalTransferToTableRow(t: InternalTransfer): Record<string, string | number> {
  return {
    id: t.id,
    debit_iban: t.debit_iban,
    credit_iban: t.credit_iban,
    reference: t.reference,
    amount: `${t.amount} ${t.currency}`,
    status: t.status,
    created_at: t.created_at,
  };
}

export function createInternalTransferCommand(): Command {
  const internalTransfer = new Command("internal-transfer").description("Manage internal transfers");

  // --- create ---
  const create = internalTransfer
    .command("create")
    .description("Create an internal transfer between two bank accounts")
    .requiredOption("--debit-iban <iban>", "IBAN of the account to debit")
    .requiredOption("--credit-iban <iban>", "IBAN of the account to credit")
    .requiredOption("--reference <text>", "transfer reference (max 99 characters)")
    .requiredOption("--amount <number>", "amount to transfer")
    .addOption(new Option("--currency <code>", "currency code").default("EUR"));
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<InternalTransferCreateOptions>(cmd);
    const client = await createClient(opts);

    const response = await client.post<{ internal_transfer: InternalTransfer }>(
      "/v2/internal_transfers",
      {
        internal_transfer: {
          debit_iban: opts.debitIban,
          credit_iban: opts.creditIban,
          reference: opts.reference,
          amount: parseFloat(opts.amount),
          currency: opts.currency,
        },
      },
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    const t = response.internal_transfer;

    const data = opts.output === "json" || opts.output === "yaml" ? t : [internalTransferToTableRow(t)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  return internalTransfer;
}
