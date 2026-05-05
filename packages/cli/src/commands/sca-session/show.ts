// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getScaSession } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

export function registerScaSessionShowCommand(parent: Command): void {
  const show = parent
    .command("show <token>")
    .description("Show the current status of an SCA session")
    .addHelpText(
      "after",
      "\nUse this after a 428 SCA-required response to poll the session token until status becomes\n" +
        '"allow" or "deny". Token validity: 15 minutes.',
    );
  addInheritableOptions(show);
  show.action(async (token: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const session = await getScaSession(client, token);

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? session
        : [{ token: session.token, status: session.status }];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
