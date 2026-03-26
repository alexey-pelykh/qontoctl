// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { updateBeneficiary, type Beneficiary, type UpdateBeneficiaryParams } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface BeneficiaryUpdateOptions extends GlobalOptions, WriteOptions {
  readonly name?: string | undefined;
  readonly iban?: string | undefined;
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

export function registerBeneficiaryUpdateCommand(parent: Command): void {
  const update = parent
    .command("update <id>")
    .description("Update a beneficiary")
    .option("--name <name>", "beneficiary name")
    .option("--iban <iban>", "IBAN")
    .option("--bic <bic>", "BIC/SWIFT code")
    .option("--email <email>", "email address")
    .option("--activity-tag <tag>", "activity tag");
  addInheritableOptions(update);
  addWriteOptions(update);
  update.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<BeneficiaryUpdateOptions>(cmd);
    const httpClient = await createClient(opts);

    const params: UpdateBeneficiaryParams = {
      ...(opts.name !== undefined ? { name: opts.name } : {}),
      ...(opts.iban !== undefined ? { iban: opts.iban } : {}),
      ...(opts.bic !== undefined ? { bic: opts.bic } : {}),
      ...(opts.email !== undefined ? { email: opts.email } : {}),
      ...(opts.activityTag !== undefined ? { activity_tag: opts.activityTag } : {}),
    };

    const b = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        updateBeneficiary(httpClient, id, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? b : [toTableRow(b)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
