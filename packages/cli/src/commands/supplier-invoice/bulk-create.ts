// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { bulkCreateSupplierInvoices, type BulkCreateSupplierInvoiceEntry } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

export function registerSupplierInvoiceBulkCreateCommand(parent: Command): void {
  const bulkCreate = parent
    .command("bulk-create")
    .description("Create supplier invoices from files")
    .argument("<files...>", "invoice file paths (PDF, PNG, JPG)");
  addInheritableOptions(bulkCreate);
  bulkCreate.action(async (files: string[], _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const entries: BulkCreateSupplierInvoiceEntry[] = [];
    for (const filePath of files) {
      const buffer = await readFile(filePath);
      const fileName = basename(filePath);
      entries.push({
        file: new Blob([buffer]),
        fileName,
        idempotencyKey: randomUUID(),
      });
    }

    const result = await bulkCreateSupplierInvoices(client, entries);

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        process.stderr.write(`Error: ${error.code}: ${error.detail}\n`);
      }
    }

    if (result.supplier_invoices.length > 0) {
      const data =
        opts.output === "json" || opts.output === "yaml"
          ? result.supplier_invoices
          : result.supplier_invoices.map((inv) => ({
              id: inv.id,
              file_name: inv.file_name,
              status: inv.status,
            }));

      process.stdout.write(formatOutput(data, opts.output) + "\n");
    }

    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
  });
}
