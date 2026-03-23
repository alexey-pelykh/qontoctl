// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getIntlBeneficiaryRequirements, type IntlBeneficiaryRequirementField } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

function toTableRow(f: IntlBeneficiaryRequirementField): Record<string, string> {
  return {
    key: f.key,
    name: f.name,
    type: f.type,
    ...(f.example !== undefined ? { example: f.example } : {}),
  };
}

export function registerIntlBeneficiaryRequirementsCommand(parent: Command): void {
  const requirements = parent
    .command("requirements <id>")
    .description("Get required fields for an international beneficiary corridor");
  addInheritableOptions(requirements);
  requirements.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const result = await getIntlBeneficiaryRequirements(client, id);

    const data = opts.output === "table" || opts.output === "csv" ? result.fields.map(toTableRow) : result;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
