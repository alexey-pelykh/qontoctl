// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerIntlQuoteCreateCommand } from "./create.js";

/**
 * Register the `intl quote` command group with all subcommands.
 */
export function registerIntlQuoteCommands(program: Command): void {
  const intl =
    program.commands.find((c) => c.name() === "intl") ??
    program.command("intl").description("International operations");

  const quote = intl.command("quote").description("Manage international transfer quotes");

  registerIntlQuoteCreateCommand(quote);
}
