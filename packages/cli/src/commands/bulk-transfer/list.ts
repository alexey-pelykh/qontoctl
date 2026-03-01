// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import type { BulkTransfer } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../../options.js";
import { fetchPaginated } from "../../pagination.js";

function toTableRow(bt: BulkTransfer): Record<string, string | number> {
  return {
    id: bt.id,
    total_count: bt.total_count,
    completed_count: bt.completed_count,
    pending_count: bt.pending_count,
    failed_count: bt.failed_count,
    created_at: bt.created_at,
  };
}

export function registerBulkTransferListCommand(parent: Command): void {
  const list = parent.command("list").description("List bulk transfers");
  addInheritableOptions(list);
  list.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
    const client = await createClient(opts);

    const result = await fetchPaginated<BulkTransfer>(client, "/v2/sepa/bulk_transfers", "bulk_transfers", opts);

    const data = opts.output === "table" || opts.output === "csv" ? result.items.map(toTableRow) : result.items;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
