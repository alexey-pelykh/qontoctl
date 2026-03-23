// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerIntlTransferCreateCommand } from "./create.js";
import { registerIntlTransferRequirementsCommand } from "./requirements.js";

/**
 * Register the `intl transfer` command group with all subcommands.
 */
export function registerIntlTransferCommands(program: Command): void {
  const intl =
    program.commands.find((c) => c.name() === "intl") ??
    program.command("intl").description("International operations");

  const transfer = intl.command("transfer").description("Manage international transfers");

  registerIntlTransferRequirementsCommand(transfer);
  registerIntlTransferCreateCommand(transfer);
}
