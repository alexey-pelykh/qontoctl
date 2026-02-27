// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerListCommand } from "./list.js";
import { registerShowCommand } from "./show.js";
import { registerAddCommand } from "./add.js";
import { registerRemoveCommand } from "./remove.js";
import { registerTestCommand } from "./test.js";

/**
 * Register all `profile` subcommands on the given parent command.
 */
export function registerProfileCommands(program: Command): void {
  const profile = program.command("profile").description("manage credential profiles");

  registerListCommand(profile);
  registerShowCommand(profile);
  registerAddCommand(profile);
  registerRemoveCommand(profile);
  registerTestCommand(profile);
}
