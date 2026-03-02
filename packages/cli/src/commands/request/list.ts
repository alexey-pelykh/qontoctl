// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import type { Request } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { fetchPaginated } from "../../pagination.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../../options.js";

function getAmount(r: Request): string {
  switch (r.request_type) {
    case "transfer":
      return `${r.amount} ${r.currency}`;
    case "multi_transfer":
      return `${r.total_transfers_amount} ${r.total_transfers_amount_currency}`;
    case "flash_card":
      return `${r.payment_lifespan_limit} ${r.currency}`;
    case "virtual_card":
      return `${r.payment_monthly_limit} ${r.currency}`;
  }
}

export function registerRequestListCommand(parent: Command): void {
  const list = parent.command("list").description("List all requests");
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
    const client = await createClient(opts);

    const result = await fetchPaginated<Request>(client, "/v2/requests", "requests", opts);

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? result.items
        : result.items.map((r) => ({
            id: r.id,
            type: r.request_type,
            amount: getAmount(r),
            status: r.status,
            requester: r.initiator_id,
          }));

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
