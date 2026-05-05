// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerScaSessionMockDecisionCommand } from "./mock-decision.js";
import { registerScaSessionShowCommand } from "./show.js";

/**
 * Register the `sca-session` command group with `show` and `mock-decision` subcommands.
 *
 * SCA (Strong Customer Authentication) sessions are issued when a write operation
 * requires user approval on the Qonto mobile app. Use `show` to poll session status,
 * and `mock-decision` to simulate user approval/denial in sandbox.
 */
export function registerScaSessionCommands(program: Command): void {
  const scaSession = program.command("sca-session").description("Manage SCA (Strong Customer Authentication) sessions");

  registerScaSessionShowCommand(scaSession);
  registerScaSessionMockDecisionCommand(scaSession);
}
