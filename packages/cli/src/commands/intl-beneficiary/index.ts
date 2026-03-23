// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerIntlBeneficiaryAddCommand } from "./add.js";
import { registerIntlBeneficiaryListCommand } from "./list.js";
import { registerIntlBeneficiaryRemoveCommand } from "./remove.js";
import { registerIntlBeneficiaryRequirementsCommand } from "./requirements.js";
import { registerIntlBeneficiaryUpdateCommand } from "./update.js";

/**
 * Register the `intl beneficiary` command group with all subcommands.
 */
export function registerIntlBeneficiaryCommands(program: Command): void {
  const intl =
    program.commands.find((c) => c.name() === "intl") ??
    program.command("intl").description("International operations");

  const beneficiary = intl.command("beneficiary").description("Manage international beneficiaries");

  registerIntlBeneficiaryListCommand(beneficiary);
  registerIntlBeneficiaryRequirementsCommand(beneficiary);
  registerIntlBeneficiaryAddCommand(beneficiary);
  registerIntlBeneficiaryUpdateCommand(beneficiary);
  registerIntlBeneficiaryRemoveCommand(beneficiary);
}
