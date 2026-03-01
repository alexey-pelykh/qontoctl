// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerTransferListCommand } from "./list.js";
import { registerTransferShowCommand } from "./show.js";

/**
 * Register the `transfer` command group with list and show subcommands.
 */
export function registerTransferCommands(program: Command): void {
  const transfer = program.command("transfer").description("Manage SEPA transfers");

  registerTransferListCommand(transfer);
  registerTransferShowCommand(transfer);
}
