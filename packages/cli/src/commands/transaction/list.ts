// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import {
  buildTransactionQueryParams,
  getOrganization,
  resolveDefaultBankAccount,
  type ListTransactionsParams,
  type Transaction,
} from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../../options.js";
import { fetchPaginated } from "../../pagination.js";

interface TransactionListOptions extends GlobalOptions, PaginationOptions {
  readonly bankAccount?: string | undefined;
  readonly status?: string[] | undefined;
  readonly side?: string | undefined;
  readonly operationType?: string[] | undefined;
  readonly settledFrom?: string | undefined;
  readonly settledTo?: string | undefined;
  readonly emittedFrom?: string | undefined;
  readonly emittedTo?: string | undefined;
  readonly updatedFrom?: string | undefined;
  readonly updatedTo?: string | undefined;
  readonly include?: string[] | undefined;
  readonly withAttachments?: true | undefined;
  readonly sortBy?: string | undefined;
}

function toTableRow(txn: Transaction): Record<string, string | number | null> {
  return {
    id: txn.id,
    settled_at: txn.settled_at,
    label: txn.label,
    side: txn.side,
    amount: txn.amount,
    currency: txn.currency,
    status: txn.status,
    operation_type: txn.operation_type,
  };
}

function buildParams(opts: TransactionListOptions): ListTransactionsParams {
  return {
    ...(opts.bankAccount !== undefined && { bank_account_id: opts.bankAccount }),
    ...(opts.status !== undefined && { status: opts.status }),
    ...(opts.side !== undefined && { side: opts.side }),
    ...(opts.operationType !== undefined && { operation_type: opts.operationType }),
    ...(opts.settledFrom !== undefined && { settled_at_from: opts.settledFrom }),
    ...(opts.settledTo !== undefined && { settled_at_to: opts.settledTo }),
    ...(opts.emittedFrom !== undefined && { emitted_at_from: opts.emittedFrom }),
    ...(opts.emittedTo !== undefined && { emitted_at_to: opts.emittedTo }),
    ...(opts.updatedFrom !== undefined && { updated_at_from: opts.updatedFrom }),
    ...(opts.updatedTo !== undefined && { updated_at_to: opts.updatedTo }),
    ...(opts.include !== undefined && { includes: opts.include }),
    ...(opts.withAttachments !== undefined && { with_attachments: opts.withAttachments }),
    ...(opts.sortBy !== undefined && { sort_by: opts.sortBy }),
  };
}

export function registerTransactionListCommand(parent: Command): void {
  const list = parent
    .command("list")
    .description("List transactions")
    .addOption(new Option("--bank-account <id>", "filter by bank account ID"))
    .addOption(new Option("--status <status...>", "filter by status").choices(["pending", "declined", "completed"]))
    .addOption(new Option("--side <side>", "filter by side").choices(["credit", "debit"]))
    .addOption(new Option("--operation-type <type...>", "filter by operation type"))
    .addOption(new Option("--settled-from <date>", "settled from date (ISO 8601)"))
    .addOption(new Option("--settled-to <date>", "settled to date (ISO 8601)"))
    .addOption(new Option("--emitted-from <date>", "emitted from date (ISO 8601)"))
    .addOption(new Option("--emitted-to <date>", "emitted to date (ISO 8601)"))
    .addOption(new Option("--updated-from <date>", "updated from date (ISO 8601)"))
    .addOption(new Option("--updated-to <date>", "updated to date (ISO 8601)"))
    .addOption(
      new Option("--include <resources...>", "include nested resources").choices([
        "labels",
        "attachments",
        "vat_details",
      ]),
    )
    .addOption(new Option("--with-attachments", "filter to transactions with attachments"))
    .addOption(
      new Option("--sort-by <sort>", "sort order (e.g. settled_at:desc, emitted_at:asc, updated_at:desc, created_at:asc)"),
    );
  addInheritableOptions(list);
  list.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<TransactionListOptions>(cmd);
    const client = await createClient(opts);

    let params = buildParams(opts);
    if (params.bank_account_id === undefined && params.iban === undefined) {
      const org = await getOrganization(client);
      const mainAccount = resolveDefaultBankAccount(org);
      if (mainAccount !== undefined) {
        params = { ...params, bank_account_id: mainAccount.id };
      }
    }
    const queryParams = buildTransactionQueryParams(params);

    const result = await fetchPaginated<Transaction>(client, "/v2/transactions", "transactions", opts, queryParams);

    const data = opts.output === "table" || opts.output === "csv" ? result.items.map(toTableRow) : result.items;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
