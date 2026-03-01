// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { registerBeneficiaryListCommand } from "./list.js";
import { registerBeneficiaryShowCommand } from "./show.js";

/**
 * Register the `beneficiary` command group with list and show subcommands.
 */
export function registerBeneficiaryCommands(program: Command): void {
  const beneficiary = program.command("beneficiary").description("Manage SEPA beneficiaries");

  registerBeneficiaryListCommand(beneficiary);
  registerBeneficiaryShowCommand(beneficiary);
}
