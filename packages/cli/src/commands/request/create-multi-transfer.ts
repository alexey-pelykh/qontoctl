// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { Option } from "commander";
import {
  createMultiTransferRequest,
  type CreateMultiTransferRequestParams,
  type MultiTransferItem,
  type RequestMultiTransfer,
} from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { parseJson } from "../../parse-json.js";
import { executeWithCliSca } from "../../sca.js";

interface CreateMultiTransferOptions extends GlobalOptions, WriteOptions {
  readonly note: string;
  readonly file: string;
  readonly scheduledDate?: string | undefined;
  readonly debitIban?: string | undefined;
}

function toTableRow(r: RequestMultiTransfer): Record<string, string | number | null> {
  return {
    id: r.id,
    status: r.status,
    total_amount: `${r.total_transfers_amount} ${r.total_transfers_amount_currency}`,
    transfers_count: r.total_transfers_count,
    scheduled_date: r.scheduled_date,
    created_at: r.created_at,
  };
}

export function registerRequestCreateMultiTransferCommand(parent: Command): void {
  const cmd = parent
    .command("create-multi-transfer")
    .description("Create a multi-transfer request")
    .addOption(new Option("--note <text>", "description for the request (max 140 chars)").makeOptionMandatory())
    .addOption(new Option("--file <path>", "JSON file with transfers array").makeOptionMandatory())
    .option("--scheduled-date <date>", "execution date (YYYY-MM-DD)")
    .option("--debit-iban <iban>", "source account IBAN");
  addInheritableOptions(cmd);
  addWriteOptions(cmd);
  cmd.action(async (_opts: unknown, command: Command) => {
    const opts = resolveGlobalOptions<CreateMultiTransferOptions>(command);
    const httpClient = await createClient(opts);

    const fileContent = await readFile(opts.file, "utf-8");
    const transfers = parseJson(fileContent, `--file ${opts.file}`) as readonly MultiTransferItem[];

    const params: CreateMultiTransferRequestParams = {
      note: opts.note,
      transfers,
      ...(opts.scheduledDate !== undefined ? { scheduled_date: opts.scheduledDate } : {}),
      ...(opts.debitIban !== undefined ? { debit_iban: opts.debitIban } : {}),
    };

    const request = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        createMultiTransferRequest(httpClient, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? request : [toTableRow(request)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
