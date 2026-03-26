// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { createIntlBeneficiary, type CreateIntlBeneficiaryParams, type IntlBeneficiary } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface IntlBeneficiaryAddOptions extends GlobalOptions, WriteOptions {
  readonly country: string;
  readonly currency: string;
  readonly field?: string[] | undefined;
}

function toTableRow(b: IntlBeneficiary): Record<string, string> {
  return {
    id: b.id,
    name: b.name,
    country: b.country,
    currency: b.currency,
  };
}

function parseFields(fields: string[] | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (fields === undefined) return result;
  for (const entry of fields) {
    const eq = entry.indexOf("=");
    if (eq === -1) {
      throw new Error(`Invalid field format: "${entry}". Expected key=value.`);
    }
    result[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return result;
}

export function registerIntlBeneficiaryAddCommand(parent: Command): void {
  const add = parent
    .command("add")
    .description("Create a new international beneficiary")
    .addOption(new Option("--country <code>", "country code (ISO 3166-1 alpha-2)").makeOptionMandatory())
    .addOption(new Option("--currency <code>", "currency code (ISO 4217)").makeOptionMandatory())
    .addOption(new Option("--field <key=value...>", "beneficiary field (repeatable)"));
  addInheritableOptions(add);
  addWriteOptions(add);
  add.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<IntlBeneficiaryAddOptions>(cmd);
    const httpClient = await createClient(opts);

    const extraFields = parseFields(opts.field);
    const params: CreateIntlBeneficiaryParams = {
      country: opts.country,
      currency: opts.currency,
      ...extraFields,
    };

    const b = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        createIntlBeneficiary(httpClient, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? b : [toTableRow(b)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
