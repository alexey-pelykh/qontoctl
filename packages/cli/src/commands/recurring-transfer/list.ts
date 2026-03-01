// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import type { RecurringTransfer } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../../options.js";
import { fetchPaginated } from "../../pagination.js";

function toTableRow(rt: RecurringTransfer): Record<string, string | number | null> {
  return {
    id: rt.id,
    beneficiary_id: rt.beneficiary_id,
    amount: rt.amount,
    amount_currency: rt.amount_currency,
    frequency: rt.frequency,
    next_execution_date: rt.next_execution_date,
    status: rt.status,
  };
}

export function registerRecurringTransferListCommand(parent: Command): void {
  const list = parent.command("list").description("List recurring transfers");
  addInheritableOptions(list);
  list.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
    const client = await createClient(opts);

    const result = await fetchPaginated<RecurringTransfer>(
      client,
      "/v2/sepa/recurring_transfers",
      "recurring_transfers",
      opts,
    );

    const data = opts.output === "table" || opts.output === "csv" ? result.items.map(toTableRow) : result.items;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
