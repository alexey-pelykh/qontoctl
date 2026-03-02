// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerTransferBulkVerifyPayeeCommand } from "./bulk-verify-payee.js";
import { registerTransferCancelCommand } from "./cancel.js";
import { registerTransferCreateCommand } from "./create.js";
import { registerTransferListCommand } from "./list.js";
import { registerTransferProofCommand } from "./proof.js";
import { registerTransferShowCommand } from "./show.js";
import { registerTransferVerifyPayeeCommand } from "./verify-payee.js";

/**
 * Register the `transfer` command group with all subcommands.
 */
export function registerTransferCommands(program: Command): void {
  const transfer = program.command("transfer").description("Manage SEPA transfers");

  registerTransferListCommand(transfer);
  registerTransferShowCommand(transfer);
  registerTransferCreateCommand(transfer);
  registerTransferCancelCommand(transfer);
  registerTransferProofCommand(transfer);
  registerTransferVerifyPayeeCommand(transfer);
  registerTransferBulkVerifyPayeeCommand(transfer);
}
