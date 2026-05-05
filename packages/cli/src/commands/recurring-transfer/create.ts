// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { createRecurringTransfer, type CreateRecurringTransferParams, type RecurringTransfer } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface RecurringTransferCreateOptions extends GlobalOptions, WriteOptions {
  readonly beneficiary: string;
  readonly debitAccount: string;
  readonly amount: string;
  readonly currency: string;
  readonly reference: string;
  readonly note?: string | undefined;
  readonly startDate: string;
  readonly schedule: string;
}

function toTableRow(rt: RecurringTransfer): Record<string, string | number | null> {
  return {
    id: rt.id,
    beneficiary_id: rt.beneficiary_id,
    amount: rt.amount,
    amount_currency: rt.amount_currency,
    frequency: rt.frequency,
    first_execution_date: rt.first_execution_date,
    next_execution_date: rt.next_execution_date,
    status: rt.status,
  };
}

export function registerRecurringTransferCreateCommand(parent: Command): void {
  const create = parent
    .command("create")
    .description("Create a recurring transfer")
    .addOption(new Option("--beneficiary <id>", "beneficiary ID").makeOptionMandatory())
    .addOption(new Option("--debit-account <id>", "bank account ID to debit").makeOptionMandatory())
    .addOption(new Option("--amount <number>", "amount to transfer").makeOptionMandatory())
    .addOption(new Option("--currency <code>", "currency code").default("EUR"))
    .addOption(new Option("--reference <text>", "transfer reference").makeOptionMandatory())
    .option("--note <text>", "optional note")
    .addOption(new Option("--start-date <date>", "first execution date (YYYY-MM-DD)").makeOptionMandatory())
    .addOption(
      new Option("--schedule <frequency>", "transfer frequency")
        .choices(["weekly", "monthly", "quarterly", "half_yearly", "yearly"])
        .makeOptionMandatory(),
    );
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<RecurringTransferCreateOptions>(cmd);
    const httpClient = await createClient(opts);

    const params: CreateRecurringTransferParams = {
      beneficiary_id: opts.beneficiary,
      bank_account_id: opts.debitAccount,
      amount: Number(opts.amount),
      currency: opts.currency,
      reference: opts.reference,
      first_execution_date: opts.startDate,
      frequency: opts.schedule as CreateRecurringTransferParams["frequency"],
      ...(opts.note !== undefined ? { note: opts.note } : {}),
    };

    const recurringTransfer = await executeWithCliSca(
      httpClient,
      async ({ scaSessionToken, idempotencyKey }) =>
        createRecurringTransfer(httpClient, params, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? recurringTransfer : [toTableRow(recurringTransfer)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
