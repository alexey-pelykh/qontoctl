// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { createTransfer, type CreateTransferParams, type Transfer } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface TransferCreateOptions extends GlobalOptions, WriteOptions {
  readonly beneficiary: string;
  readonly debitAccount: string;
  readonly reference: string;
  readonly amount: string;
  readonly currency: string;
  readonly note?: string | undefined;
  readonly scheduledDate?: string | undefined;
  readonly vopProofToken: string;
}

function toTableRow(t: Transfer): Record<string, string | number | null> {
  return {
    id: t.id,
    beneficiary_id: t.beneficiary_id,
    amount: t.amount,
    amount_currency: t.amount_currency,
    status: t.status,
    scheduled_date: t.scheduled_date,
    reference: t.reference,
  };
}

export function registerTransferCreateCommand(parent: Command): void {
  const create = parent
    .command("create")
    .description("Create a SEPA transfer")
    .addOption(new Option("--beneficiary <id>", "beneficiary ID").makeOptionMandatory())
    .addOption(new Option("--debit-account <id>", "bank account ID to debit").makeOptionMandatory())
    .addOption(new Option("--reference <text>", "transfer reference").makeOptionMandatory())
    .addOption(new Option("--amount <number>", "amount to transfer").makeOptionMandatory())
    .addOption(new Option("--currency <code>", "currency code").default("EUR"))
    .option("--note <text>", "optional note")
    .option("--scheduled-date <date>", "scheduled date (YYYY-MM-DD)")
    .addOption(new Option("--vop-proof-token <token>", "VoP proof token from verify-payee").makeOptionMandatory());
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<TransferCreateOptions>(cmd);
    const httpClient = await createClient(opts);

    const params: CreateTransferParams = {
      beneficiary_id: opts.beneficiary,
      bank_account_id: opts.debitAccount,
      reference: opts.reference,
      amount: opts.amount,
      currency: opts.currency,
      vop_proof_token: opts.vopProofToken,
      ...(opts.note !== undefined ? { note: opts.note } : {}),
      ...(opts.scheduledDate !== undefined ? { scheduled_date: opts.scheduledDate } : {}),
    };

    const transfer = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        createTransfer(httpClient, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? transfer : [toTableRow(transfer)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
