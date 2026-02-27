// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { basename, join, resolve, sep } from "node:path";
import { writeFile } from "node:fs/promises";
import { Command, Option } from "commander";
import type { Statement } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import type { GlobalOptions, PaginationOptions } from "../options.js";
import { fetchPaginated } from "../pagination.js";

interface StatementListOptions {
  readonly bankAccount?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

function formatStatementRow(s: Statement): Record<string, unknown> {
  return {
    id: s.id,
    bank_account_id: s.bank_account_id,
    period: s.period,
    file_name: s.file.file_name,
    file_content_type: s.file.file_content_type,
    file_size: s.file.file_size,
  };
}

/**
 * Register the `statement` command group on the given program.
 */
export function registerStatementCommands(program: Command): void {
  const statement = program.command("statement").description("Manage bank statements");

  statement
    .command("list")
    .description("List bank statements")
    .addOption(new Option("--bank-account <id>", "filter by bank account ID"))
    .addOption(new Option("--from <period>", "start period (MM-YYYY)"))
    .addOption(new Option("--to <period>", "end period (MM-YYYY)"))
    .action(async (commandOpts: StatementListOptions) => {
      const globalOpts = program.opts() as GlobalOptions & PaginationOptions;
      const client = await createClient(globalOpts);

      const params: Record<string, string> = {};
      if (commandOpts.bankAccount !== undefined) {
        params["bank_account_ids[]"] = commandOpts.bankAccount;
      }
      if (commandOpts.from !== undefined) {
        params["period_from"] = commandOpts.from;
      }
      if (commandOpts.to !== undefined) {
        params["period_to"] = commandOpts.to;
      }

      const result = await fetchPaginated<Statement>(client, "/v2/statements", "statements", globalOpts, params);

      const rows = result.items.map(formatStatementRow);
      const output = formatOutput(rows, globalOpts.output);
      if (output !== "") {
        process.stdout.write(`${output}\n`);
      }
    });

  statement
    .command("show")
    .description("Show a bank statement")
    .argument("<id>", "statement ID")
    .action(async (id: string) => {
      const globalOpts = program.opts() as GlobalOptions;
      const client = await createClient(globalOpts);

      const response = await client.get<{ statement: Statement }>(`/v2/statements/${encodeURIComponent(id)}`);

      const rows = [formatStatementRow(response.statement)];
      const output = formatOutput(rows, globalOpts.output);
      if (output !== "") {
        process.stdout.write(`${output}\n`);
      }
    });

  statement
    .command("download")
    .description("Download a statement PDF")
    .argument("<id>", "statement ID")
    .addOption(new Option("--output-dir <path>", "directory to save the file (default: current directory)"))
    .action(async (id: string, commandOpts: { outputDir?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;
      const client = await createClient(globalOpts);

      const response = await client.get<{ statement: Statement }>(`/v2/statements/${encodeURIComponent(id)}`);

      const { file } = response.statement;
      const fileResponse = await fetch(file.file_url);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download statement: ${fileResponse.status} ${fileResponse.statusText}`);
      }

      const outputDir = commandOpts.outputDir ?? ".";
      const safeName = basename(file.file_name);
      const outputPath = join(outputDir, safeName);

      const resolvedDir = resolve(outputDir);
      const resolvedPath = resolve(outputPath);
      if (!resolvedPath.startsWith(resolvedDir + sep) && resolvedPath !== resolvedDir) {
        throw new Error(`Refusing to write outside output directory: ${file.file_name}`);
      }

      const buffer = Buffer.from(await fileResponse.arrayBuffer());
      await writeFile(outputPath, buffer);

      process.stdout.write(`Downloaded: ${outputPath}\n`);
    });
}
