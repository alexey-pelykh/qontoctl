// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerCardAppearancesCommand } from "./appearances.js";
import { registerCardCreateCommand, registerCardBulkCreateCommand } from "./create.js";
import { registerCardDiscardCommand } from "./discard.js";
import { registerCardIframeUrlCommand } from "./iframe-url.js";
import { registerCardListCommand } from "./list.js";
import { registerCardLockCommand, registerCardUnlockCommand } from "./lock.js";
import { registerCardReportLostCommand, registerCardReportStolenCommand } from "./report.js";
import { registerCardUpdateLimitsCommand } from "./update-limits.js";
import { registerCardUpdateNicknameCommand } from "./update-nickname.js";
import { registerCardUpdateOptionsCommand } from "./update-options.js";
import { registerCardUpdateRestrictionsCommand } from "./update-restrictions.js";

/**
 * Register the `card` command group with all subcommands.
 */
export function registerCardCommands(program: Command): void {
  const card = program.command("card").description("Manage cards");

  registerCardListCommand(card);
  registerCardCreateCommand(card);
  registerCardBulkCreateCommand(card);
  registerCardLockCommand(card);
  registerCardUnlockCommand(card);
  registerCardReportLostCommand(card);
  registerCardReportStolenCommand(card);
  registerCardDiscardCommand(card);
  registerCardUpdateLimitsCommand(card);
  registerCardUpdateNicknameCommand(card);
  registerCardUpdateOptionsCommand(card);
  registerCardUpdateRestrictionsCommand(card);
  registerCardIframeUrlCommand(card);
  registerCardAppearancesCommand(card);
}
