// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { buildBeneficiaryQueryParams, type Beneficiary, type ListBeneficiariesParams } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../../options.js";
import { fetchPaginated } from "../../pagination.js";

interface BeneficiaryListOptions extends GlobalOptions, PaginationOptions {
  readonly status?: string[] | undefined;
  readonly trusted?: true | undefined;
  readonly iban?: string[] | undefined;
  readonly updatedFrom?: string | undefined;
  readonly updatedTo?: string | undefined;
  readonly sortBy?: string | undefined;
}

function toTableRow(b: Beneficiary): Record<string, string | boolean> {
  return {
    id: b.id,
    name: b.name,
    iban: b.iban,
    status: b.status,
    trusted: b.trusted,
  };
}

function buildParams(opts: BeneficiaryListOptions): ListBeneficiariesParams {
  return {
    ...(opts.status !== undefined && { status: opts.status }),
    ...(opts.trusted !== undefined && { trusted: opts.trusted }),
    ...(opts.iban !== undefined && { iban: opts.iban }),
    ...(opts.updatedFrom !== undefined && { updated_at_from: opts.updatedFrom }),
    ...(opts.updatedTo !== undefined && { updated_at_to: opts.updatedTo }),
    ...(opts.sortBy !== undefined && { sort_by: opts.sortBy }),
  };
}

export function registerBeneficiaryListCommand(parent: Command): void {
  const list = parent
    .command("list")
    .description("List beneficiaries")
    .addOption(new Option("--status <status...>", "filter by status").choices(["pending", "validated", "declined"]))
    .addOption(new Option("--trusted", "filter to trusted beneficiaries only"))
    .addOption(new Option("--iban <iban...>", "filter by IBAN"))
    .addOption(new Option("--updated-from <date>", "updated from date (ISO 8601)"))
    .addOption(new Option("--updated-to <date>", "updated to date (ISO 8601)"))
    .addOption(new Option("--sort-by <sort>", "sort order (e.g. updated_at:desc)"));
  addInheritableOptions(list);
  list.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<BeneficiaryListOptions>(cmd);
    const client = await createClient(opts);

    const params = buildParams(opts);
    const queryParams = buildBeneficiaryQueryParams(params);

    const result = await fetchPaginated<Beneficiary>(
      client,
      "/v2/sepa/beneficiaries",
      "beneficiaries",
      opts,
      queryParams,
    );

    const data = opts.output === "table" || opts.output === "csv" ? result.items.map(toTableRow) : result.items;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
