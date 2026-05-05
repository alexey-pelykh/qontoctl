// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { approveRequest, type RequestType } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface RequestApproveOptions extends GlobalOptions, WriteOptions {
  readonly type: RequestType;
  readonly debitIban?: string | undefined;
}

export function registerRequestApproveCommand(parent: Command): void {
  const approve = parent
    .command("approve <id>")
    .description("Approve a pending request (SCA may trigger)")
    .addOption(
      new Option("--type <type>", "request type")
        .choices(["flash_card", "virtual_card", "transfer", "multi_transfer"])
        .makeOptionMandatory(),
    )
    .option("--debit-iban <iban>", "IBAN of account to debit or link to the card");
  addInheritableOptions(approve);
  addWriteOptions(approve);
  approve.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<RequestApproveOptions>(cmd);
    const httpClient = await createClient(opts);

    await executeWithCliSca(
      httpClient,
      async ({ scaSessionToken, idempotencyKey }) =>
        approveRequest(
          httpClient,
          opts.type,
          id,
          opts.debitIban !== undefined ? { debit_iban: opts.debitIban } : undefined,
          {
            idempotencyKey,
            ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
          },
        ),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ approved: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`Request ${id} approved.\n`);
    }
  });
}
