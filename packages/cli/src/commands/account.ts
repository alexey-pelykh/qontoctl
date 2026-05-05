// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { writeFile } from "node:fs/promises";
import { Command, Option } from "commander";
import {
  createBankAccount,
  getBankAccount,
  getIbanCertificate,
  updateBankAccount,
  closeBankAccount,
} from "@qontoctl/core";
import type { BankAccount } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import { fetchPaginated } from "../pagination.js";
import type { GlobalOptions, PaginationOptions, WriteOptions } from "../options.js";
import { executeWithCliSca } from "../sca.js";

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

  const list = account.command("list").description("List bank accounts");
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
    const client = await createClient(opts);

    const result = await fetchPaginated<BankAccount>(client, "/v2/bank_accounts", "bank_accounts", opts);

    const data = opts.output === "json" || opts.output === "yaml" ? result.items : result.items.map(toListRow);

    const output = formatOutput(data, opts.output);
    process.stdout.write(output + "\n");
  });

  const show = account.command("show").description("Show bank account details").argument("<id>", "Bank account ID");
  addInheritableOptions(show);
  show.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
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

  const ibanCertificate = account
    .command("iban-certificate")
    .description("Download IBAN certificate PDF")
    .argument("<id>", "Bank account ID")
    .addOption(new Option("--output-file <path>", "file path to save the PDF"));
  addInheritableOptions(ibanCertificate);
  ibanCertificate.action(async (id: string, commandOpts: { outputFile?: string }, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const buffer = await getIbanCertificate(client, id);
    const outputFile = commandOpts.outputFile ?? `iban-certificate-${id}.pdf`;

    await writeFile(outputFile, buffer);
    process.stdout.write(`Downloaded: ${outputFile}\n`);
  });

  // --- create ---
  const create = account
    .command("create")
    .description("Create a new bank account")
    .addOption(new Option("--name <name>", "account name").makeOptionMandatory());
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { name: string }>(cmd);
    const client = await createClient(opts);

    const bankAccount = await executeWithCliSca(
      client,
      ({ scaSessionToken, idempotencyKey }) =>
        createBankAccount(
          client,
          { name: opts.name },
          {
            idempotencyKey,
            ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
          },
        ),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

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
              currency: bankAccount.currency,
              status: bankAccount.status,
            },
          ];

    const output = formatOutput(data, opts.output);
    process.stdout.write(output + "\n");
  });

  // --- update ---
  const update = account
    .command("update")
    .description("Update a bank account")
    .argument("<id>", "Bank account ID")
    .option("--name <name>", "new account name");
  addInheritableOptions(update);
  addWriteOptions(update);
  update.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { name?: string | undefined }>(cmd);
    const client = await createClient(opts);

    const params: Record<string, string> = {};
    if (opts.name !== undefined) params["name"] = opts.name;

    const bankAccount = await executeWithCliSca(
      client,
      ({ scaSessionToken, idempotencyKey }) =>
        updateBankAccount(client, id, params, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

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
              currency: bankAccount.currency,
              status: bankAccount.status,
            },
          ];

    const output = formatOutput(data, opts.output);
    process.stdout.write(output + "\n");
  });

  // --- close ---
  const close = account
    .command("close")
    .description("Close a bank account")
    .argument("<id>", "Bank account ID")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(close);
  addWriteOptions(close);
  close.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { yes?: true | undefined }>(cmd);
    const client = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to close account ${id}. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    await executeWithCliSca(
      client,
      ({ scaSessionToken, idempotencyKey }) =>
        closeBankAccount(client, id, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ closed: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`Account ${id} closed.\n`);
    }
  });
}
