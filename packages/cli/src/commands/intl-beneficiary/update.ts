// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { updateIntlBeneficiary, type IntlBeneficiary, type UpdateIntlBeneficiaryParams } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface IntlBeneficiaryUpdateOptions extends GlobalOptions, WriteOptions {
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

export function registerIntlBeneficiaryUpdateCommand(parent: Command): void {
  const update = parent
    .command("update <id>")
    .description("Update an international beneficiary")
    .addOption(new Option("--field <key=value...>", "beneficiary field (repeatable)"));
  addInheritableOptions(update);
  addWriteOptions(update);
  update.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<IntlBeneficiaryUpdateOptions>(cmd);
    const httpClient = await createClient(opts);

    const params: UpdateIntlBeneficiaryParams = parseFields(opts.field);

    const b = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        updateIntlBeneficiary(httpClient, id, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? b : [toTableRow(b)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
