// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { Option } from "commander";
import { createBulkTransfer, type BulkTransfer, type BulkTransferItem } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface BulkTransferCreateOptions extends GlobalOptions, WriteOptions {
  readonly file: string;
}

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

export function registerBulkTransferCreateCommand(parent: Command): void {
  const create = parent
    .command("create")
    .description("Create a bulk transfer from a JSON file")
    .addOption(new Option("--file <path>", "JSON file with transfers array").makeOptionMandatory());
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<BulkTransferCreateOptions>(cmd);
    const httpClient = await createClient(opts);

    const fileContent = await readFile(opts.file, "utf-8");
    const transfers = JSON.parse(fileContent) as readonly BulkTransferItem[];

    const bulkTransfer = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        createBulkTransfer(
          httpClient,
          { transfers },
          {
            ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
            ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
          },
        ),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? bulkTransfer : [toTableRow(bulkTransfer)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
