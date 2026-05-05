// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { untrustBeneficiaries } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

export function registerBeneficiaryUntrustCommand(parent: Command): void {
  const untrust = parent.command("untrust <id...>").description("Untrust one or more beneficiaries");
  addInheritableOptions(untrust);
  addWriteOptions(untrust);
  untrust.action(async (ids: string[], _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions>(cmd);
    const httpClient = await createClient(opts);

    await executeWithCliSca(
      httpClient,
      async ({ scaSessionToken, idempotencyKey }) =>
        untrustBeneficiaries(httpClient, ids, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ untrusted: true, ids }, opts.output) + "\n");
    } else {
      process.stdout.write(`Untrusted ${ids.length} beneficiar${ids.length === 1 ? "y" : "ies"}.\n`);
    }
  });
}
