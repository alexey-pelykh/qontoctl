// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { buildTransferQueryParams, type ListTransfersParams, type Transfer } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../../options.js";
import { fetchPaginated } from "../../pagination.js";

interface TransferListOptions extends GlobalOptions, PaginationOptions {
  readonly status?: string[] | undefined;
  readonly beneficiary?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly sortBy?: string | undefined;
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

function buildParams(opts: TransferListOptions): ListTransfersParams {
  return {
    ...(opts.status !== undefined && { status: opts.status }),
    ...(opts.beneficiary !== undefined && { beneficiary_ids: [opts.beneficiary] }),
    ...(opts.from !== undefined && { updated_at_from: opts.from }),
    ...(opts.to !== undefined && { updated_at_to: opts.to }),
    ...(opts.sortBy !== undefined && { sort_by: opts.sortBy }),
  };
}

export function registerTransferListCommand(parent: Command): void {
  const list = parent
    .command("list")
    .description("List SEPA transfers")
    .addOption(
      new Option("--status <status...>", "filter by status").choices([
        "pending",
        "processing",
        "canceled",
        "declined",
        "settled",
      ]),
    )
    .addOption(new Option("--beneficiary <id>", "filter by beneficiary ID"))
    .addOption(new Option("--from <date>", "updated from date (ISO 8601)"))
    .addOption(new Option("--to <date>", "updated to date (ISO 8601)"))
    .addOption(new Option("--sort-by <sort>", "sort order (e.g. updated_at:desc)"));
  addInheritableOptions(list);
  list.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<TransferListOptions>(cmd);
    const client = await createClient(opts);

    const params = buildParams(opts);
    const queryParams = buildTransferQueryParams(params);

    const result = await fetchPaginated<Transfer>(client, "/v2/sepa/transfers", "transfers", opts, queryParams);

    const data = opts.output === "table" || opts.output === "csv" ? result.items.map(toTableRow) : result.items;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
