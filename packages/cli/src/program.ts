// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { createRequire } from "node:module";
import { Command, Option } from "commander";
import { registerCompletionCommand } from "./completions/index.js";
import { registerBeneficiaryCommands } from "./commands/beneficiary/index.js";
import { registerCardCommands } from "./commands/card/index.js";
import { registerTransactionCommands } from "./commands/transaction/index.js";
import { registerBulkTransferCommands } from "./commands/bulk-transfer/index.js";
import { registerEInvoicingCommands } from "./commands/einvoicing.js";
import { registerRecurringTransferCommands } from "./commands/recurring-transfer/index.js";
import { registerOrgCommands } from "./commands/org.js";
import { registerAccountCommands } from "./commands/account.js";
import { registerSupplierInvoiceCommands } from "./commands/supplier-invoice/index.js";
import { createTeamCommand } from "./commands/team.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerProfileCommands } from "./commands/profile/index.js";
import { OUTPUT_FORMATS } from "./options.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

export function createProgram(): Command {
  const program = new Command();

  program.name("qontoctl").description("The complete CLI & MCP for Qonto").version(packageJson.version);

  program
    .addOption(new Option("-p, --profile <name>", "configuration profile to use"))
    .addOption(new Option("-o, --output <format>", "output format").choices([...OUTPUT_FORMATS]).default("table"))
    .addOption(new Option("--verbose", "enable verbose output"))
    .addOption(new Option("--debug", "enable debug output (implies --verbose)"))
    .addOption(new Option("--page <number>", "fetch a specific page of results").argParser(parsePositiveInt))
    .addOption(new Option("--per-page <number>", "number of results per page").argParser(parsePositiveInt))
    .addOption(new Option("--no-paginate", "disable auto-pagination"));

  registerCompletionCommand(program);
  registerBeneficiaryCommands(program);
  registerCardCommands(program);
  registerEInvoicingCommands(program);
  registerAuthCommands(program);
  registerTransactionCommands(program);
  registerBulkTransferCommands(program);
  registerRecurringTransferCommands(program);
  registerOrgCommands(program);
  registerAccountCommands(program);
  registerSupplierInvoiceCommands(program);
  program.addCommand(createTeamCommand());
  registerProfileCommands(program);

  program.action(() => {
    program.outputHelp();
  });

  return program;
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got "${value}".`);
  }
  return parsed;
}
