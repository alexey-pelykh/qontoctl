// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getBankAccount } from "@qontoctl/core";
import type { BankAccount } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import { fetchPaginated } from "../pagination.js";
import type { GlobalOptions, PaginationOptions } from "../options.js";

/**
 * Pick the fields shown in table/csv list output.
 */
function toListRow(account: BankAccount): Record<string, unknown> {
  return {
    id: account.id,
    name: account.name,
    iban: account.iban,
    balance: account.balance,
    currency: account.currency,
    status: account.status,
  };
}

/**
 * Register the `account` command group on the given program.
 */
export function registerAccountCommands(program: Command): void {
  const account = program.command("account").description("Bank account operations");

  account
    .command("list")
    .description("List bank accounts")
    .action(async () => {
      const opts = program.opts<GlobalOptions & PaginationOptions>();
      const client = await createClient(opts);

      const result = await fetchPaginated<BankAccount>(client, "/v2/bank_accounts", "bank_accounts", opts);

      const data = opts.output === "json" || opts.output === "yaml" ? result.items : result.items.map(toListRow);

      const output = formatOutput(data, opts.output);
      process.stdout.write(output + "\n");
    });

  account
    .command("show")
    .description("Show bank account details")
    .argument("<id>", "Bank account ID")
    .action(async (id: string) => {
      const opts = program.opts<GlobalOptions>();
      const client = await createClient(opts);
      const bankAccount = await getBankAccount(client, id);

      const data =
        opts.output === "json" || opts.output === "yaml"
          ? bankAccount
          : [
              {
                id: bankAccount.id,
                name: bankAccount.name,
                iban: bankAccount.iban,
                bic: bankAccount.bic,
                balance: bankAccount.balance,
                authorized_balance: bankAccount.authorized_balance,
                currency: bankAccount.currency,
                status: bankAccount.status,
                main: bankAccount.main,
              },
            ];

      const output = formatOutput(data, opts.output);
      process.stdout.write(output + "\n");
    });
}
