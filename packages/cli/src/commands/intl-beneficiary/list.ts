// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import type { IntlBeneficiary } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../../options.js";
import { fetchPaginated } from "../../pagination.js";

type IntlBeneficiaryListOptions = GlobalOptions & PaginationOptions;

function toTableRow(b: IntlBeneficiary): Record<string, string> {
  return {
    id: b.id,
    name: b.name,
    country: b.country,
    currency: b.currency,
  };
}

export function registerIntlBeneficiaryListCommand(parent: Command): void {
  const list = parent.command("list").description("List international beneficiaries");
  addInheritableOptions(list);
  list.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<IntlBeneficiaryListOptions>(cmd);
    const client = await createClient(opts);

    const result = await fetchPaginated<IntlBeneficiary>(
      client,
      "/v2/international/beneficiaries",
      "international_beneficiaries",
      opts,
    );

    const data = opts.output === "table" || opts.output === "csv" ? result.items.map(toTableRow) : result.items;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
