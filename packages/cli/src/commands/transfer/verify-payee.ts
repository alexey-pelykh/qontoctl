// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { verifyPayee, type VopResult } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface VerifyPayeeOptions extends GlobalOptions, WriteOptions {
  readonly iban: string;
  readonly name: string;
}

function toTableRow(r: VopResult): Record<string, string> {
  return {
    iban: r.iban,
    name: r.name,
    result: r.result,
  };
}

export function registerTransferVerifyPayeeCommand(parent: Command): void {
  const vp = parent
    .command("verify-payee")
    .description("Verify a payee (Verification of Payee)")
    .addOption(new Option("--iban <iban>", "IBAN to verify").makeOptionMandatory())
    .addOption(new Option("--name <name>", "name to verify against the IBAN").makeOptionMandatory());
  addInheritableOptions(vp);
  addWriteOptions(vp);
  vp.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<VerifyPayeeOptions>(cmd);
    const httpClient = await createClient(opts);

    const result = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        verifyPayee(
          httpClient,
          { iban: opts.iban, name: opts.name },
          {
            ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
            ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
          },
        ),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? result : [toTableRow(result)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
