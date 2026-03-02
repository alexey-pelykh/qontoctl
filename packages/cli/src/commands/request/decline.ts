// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { declineRequest, type RequestType } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface RequestDeclineOptions extends GlobalOptions, WriteOptions {
  readonly type: RequestType;
  readonly reason: string;
}

export function registerRequestDeclineCommand(parent: Command): void {
  const decline = parent
    .command("decline <id>")
    .description("Decline a pending request")
    .addOption(
      new Option("--type <type>", "request type")
        .choices(["flash_card", "virtual_card", "transfer", "multi_transfer"])
        .makeOptionMandatory(),
    )
    .addOption(new Option("--reason <text>", "reason for declining").makeOptionMandatory());
  addInheritableOptions(decline);
  addWriteOptions(decline);
  decline.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<RequestDeclineOptions>(cmd);
    const httpClient = await createClient(opts);

    await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        declineRequest(httpClient, opts.type, id, { declined_note: opts.reason }, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ declined: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`Request ${id} declined.\n`);
    }
  });
}
