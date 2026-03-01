// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getBeneficiary } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

export function registerBeneficiaryShowCommand(parent: Command): void {
  const show = parent.command("show <id>").description("Show beneficiary details");
  addInheritableOptions(show);
  show.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const b = await getBeneficiary(client, id);

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? b
        : [
            {
              id: b.id,
              name: b.name,
              iban: b.iban,
              bic: b.bic,
              email: b.email ?? "",
              activity_tag: b.activity_tag ?? "",
              status: b.status,
              trusted: b.trusted,
              created_at: b.created_at,
              updated_at: b.updated_at,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
