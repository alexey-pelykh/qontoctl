// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { listIntlCurrencies, type IntlCurrency } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions } from "../options.js";

interface IntlCurrenciesOptions extends GlobalOptions {
  readonly search?: string | undefined;
}

function toTableRow(c: IntlCurrency): Record<string, string> {
  return {
    code: c.code,
    name: c.name,
    ...(c.min_amount !== undefined ? { min_amount: String(c.min_amount) } : {}),
    ...(c.max_amount !== undefined ? { max_amount: String(c.max_amount) } : {}),
  };
}

export function registerIntlCurrenciesCommand(program: Command): void {
  const intl =
    program.commands.find((c) => c.name() === "intl") ??
    program.command("intl").description("International operations");

  const currencies = intl.command("currencies").description("List supported currencies for international transfers");
  currencies.addOption(new Option("--search <term>", "filter currencies by code or name"));
  addInheritableOptions(currencies);
  currencies.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<IntlCurrenciesOptions>(cmd);
    const client = await createClient(opts);

    let result = await listIntlCurrencies(client);

    if (opts.search !== undefined) {
      const term = opts.search.toLowerCase();
      result = result.filter((c) => c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term));
    }

    const data = opts.output === "table" || opts.output === "csv" ? result.map(toTableRow) : result;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
