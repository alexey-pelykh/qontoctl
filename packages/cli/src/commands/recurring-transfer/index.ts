// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerRecurringTransferCancelCommand } from "./cancel.js";
import { registerRecurringTransferCreateCommand } from "./create.js";
import { registerRecurringTransferListCommand } from "./list.js";
import { registerRecurringTransferShowCommand } from "./show.js";

/**
 * Register the `recurring-transfer` command group with list, show, create, and cancel subcommands.
 */
export function registerRecurringTransferCommands(program: Command): void {
  const rt = program.command("recurring-transfer").description("Manage recurring transfers");

  registerRecurringTransferCancelCommand(rt);
  registerRecurringTransferCreateCommand(rt);
  registerRecurringTransferListCommand(rt);
  registerRecurringTransferShowCommand(rt);
}
