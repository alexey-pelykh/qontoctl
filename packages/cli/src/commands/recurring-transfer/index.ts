// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerRecurringTransferListCommand } from "./list.js";
import { registerRecurringTransferShowCommand } from "./show.js";

/**
 * Register the `recurring-transfer` command group with list and show subcommands.
 */
export function registerRecurringTransferCommands(program: Command): void {
  const rt = program.command("recurring-transfer").description("Manage recurring transfers");

  registerRecurringTransferListCommand(rt);
  registerRecurringTransferShowCommand(rt);
}
