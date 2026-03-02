// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { trustBeneficiaries } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

export function registerBeneficiaryTrustCommand(parent: Command): void {
  const trust = parent.command("trust <id...>").description("Trust one or more beneficiaries");
  addInheritableOptions(trust);
  addWriteOptions(trust);
  trust.action(async (ids: string[], _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions>(cmd);
    const httpClient = await createClient(opts);

    await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        trustBeneficiaries(httpClient, ids, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose },
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ trusted: true, ids }, opts.output) + "\n");
    } else {
      process.stdout.write(`Trusted ${ids.length} beneficiar${ids.length === 1 ? "y" : "ies"}.\n`);
    }
  });
}
