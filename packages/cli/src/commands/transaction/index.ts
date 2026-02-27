// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerTransactionListCommand } from "./list.js";
import { registerTransactionShowCommand } from "./show.js";

/**
 * Register the `transaction` command group with list and show subcommands.
 */
export function registerTransactionCommands(program: Command): void {
  const txn = program.command("transaction").description("Manage transactions");

  registerTransactionListCommand(txn);
  registerTransactionShowCommand(txn);
}
