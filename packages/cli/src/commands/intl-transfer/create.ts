// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { createIntlTransfer, type CreateIntlTransferParams, type IntlTransfer } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface IntlTransferCreateOptions extends GlobalOptions, WriteOptions {
  readonly beneficiary: string;
  readonly quote: string;
  readonly field?: string[] | undefined;
}

function toTableRow(t: IntlTransfer): Record<string, unknown> {
  return {
    id: t.id,
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

export function registerIntlTransferCreateCommand(parent: Command): void {
  const create = parent
    .command("create")
    .description("Create an international transfer")
    .addOption(new Option("--beneficiary <id>", "international beneficiary ID").makeOptionMandatory())
    .addOption(new Option("--quote <id>", "quote ID").makeOptionMandatory())
    .addOption(new Option("--field <key=value...>", "transfer field (repeatable)"));
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<IntlTransferCreateOptions>(cmd);
    const httpClient = await createClient(opts);

    const extraFields = parseFields(opts.field);
    const params: CreateIntlTransferParams = {
      beneficiary_id: opts.beneficiary,
      quote_id: opts.quote,
      ...extraFields,
    };

    const transfer = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        createIntlTransfer(httpClient, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? transfer : [toTableRow(transfer)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
