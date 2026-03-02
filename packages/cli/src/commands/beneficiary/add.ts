// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { createBeneficiary, type Beneficiary, type CreateBeneficiaryParams } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface BeneficiaryAddOptions extends GlobalOptions, WriteOptions {
  readonly name: string;
  readonly iban: string;
  readonly bic?: string | undefined;
  readonly email?: string | undefined;
  readonly activityTag?: string | undefined;
}

function toTableRow(b: Beneficiary): Record<string, string | boolean> {
  return {
    id: b.id,
    name: b.name,
    iban: b.iban,
    bic: b.bic,
    status: b.status,
    trusted: b.trusted,
  };
}

export function registerBeneficiaryAddCommand(parent: Command): void {
  const add = parent
    .command("add")
    .description("Create a new beneficiary")
    .addOption(new Option("--name <name>", "beneficiary name").makeOptionMandatory())
    .addOption(new Option("--iban <iban>", "IBAN").makeOptionMandatory())
    .option("--bic <bic>", "BIC/SWIFT code")
    .option("--email <email>", "email address")
    .option("--activity-tag <tag>", "activity tag");
  addInheritableOptions(add);
  addWriteOptions(add);
  add.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<BeneficiaryAddOptions>(cmd);
    const httpClient = await createClient(opts);

    const params: CreateBeneficiaryParams = {
      name: opts.name,
      iban: opts.iban,
      ...(opts.bic !== undefined ? { bic: opts.bic } : {}),
      ...(opts.email !== undefined ? { email: opts.email } : {}),
      ...(opts.activityTag !== undefined ? { activity_tag: opts.activityTag } : {}),
    };

    const b = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        createBeneficiary(httpClient, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? b : [toTableRow(b)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
