// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerBulkTransferCreateCommand } from "./create.js";
import { registerBulkTransferListCommand } from "./list.js";
import { registerBulkTransferShowCommand } from "./show.js";

/**
 * Register the `bulk-transfer` command group with list, show, and create subcommands.
 */
export function registerBulkTransferCommands(program: Command): void {
  const bt = program.command("bulk-transfer").description("Manage bulk transfers");

  registerBulkTransferCreateCommand(bt);
  registerBulkTransferListCommand(bt);
  registerBulkTransferShowCommand(bt);
}
