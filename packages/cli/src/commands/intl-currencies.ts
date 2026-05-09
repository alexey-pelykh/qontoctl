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
  readonly source: string;
  readonly search?: string | undefined;
}

function toTableRow(c: IntlCurrency): Record<string, string> {
  return {
    currency_code: c.currency_code,
    country_code: c.country_code,
    ...(c.suggestion_priority !== undefined ? { suggestion_priority: String(c.suggestion_priority) } : {}),
  };
}

export function registerIntlCurrenciesCommand(program: Command): void {
  const intl =
    program.commands.find((c) => c.name() === "intl") ??
    program.command("intl").description("International operations");

  const currencies = intl.command("currencies").description("List supported currencies for international transfers");
  currencies.addOption(
    new Option("--source <code>", "ISO 4217 source currency code (required by the API)").default("EUR"),
  );
  currencies.addOption(new Option("--search <term>", "filter currencies by code"));
  addInheritableOptions(currencies);
  currencies.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<IntlCurrenciesOptions>(cmd);
    const client = await createClient(opts);

    let result = await listIntlCurrencies(client, opts.source);

    if (opts.search !== undefined) {
      const term = opts.search.toLowerCase();
      result = result.filter(
        (c) => c.currency_code.toLowerCase().includes(term) || c.country_code.toLowerCase().includes(term),
      );
    }

    const data = opts.output === "table" || opts.output === "csv" ? result.map(toTableRow) : result;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
