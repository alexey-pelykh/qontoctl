// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { Option } from "commander";
import { bulkVerifyPayee, type VopEntry, type VopResult } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface BulkVerifyPayeeOptions extends GlobalOptions, WriteOptions {
  readonly file: string;
}

function toTableRow(r: VopResult): Record<string, string> {
  return {
    iban: r.iban,
    name: r.name,
    result: r.result,
  };
}

function parseCsv(content: string): VopEntry[] {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  const entries: VopEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    // Skip header row if it looks like a header
    if (i === 0 && line.toLowerCase().includes("iban") && line.toLowerCase().includes("name")) {
      continue;
    }
    const parts = line.split(",");
    const iban = parts[0]?.trim();
    const name = parts[1]?.trim();
    if (iban !== undefined && iban.length > 0 && name !== undefined && name.length > 0) {
      entries.push({ iban, name });
    }
  }

  return entries;
}

export function registerTransferBulkVerifyPayeeCommand(parent: Command): void {
  const bvp = parent
    .command("bulk-verify-payee")
    .description("Bulk verify payees from a CSV file (Verification of Payee)")
    .addOption(new Option("--file <path>", "CSV file with iban,name columns").makeOptionMandatory());
  addInheritableOptions(bvp);
  addWriteOptions(bvp);
  bvp.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<BulkVerifyPayeeOptions>(cmd);
    const httpClient = await createClient(opts);

    const content = await readFile(opts.file, "utf-8");
    const entries = parseCsv(content);

    if (entries.length === 0) {
      process.stderr.write("No valid entries found in CSV file.\n");
      process.exitCode = 1;
      return;
    }

    const results = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        bulkVerifyPayee(httpClient, entries, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? results : results.map((r) => toTableRow(r));
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
