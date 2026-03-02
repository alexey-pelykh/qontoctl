// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { listCardAppearances } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

export function registerCardAppearancesCommand(parent: Command): void {
  const appearances = parent.command("appearances").description("List available card appearances");
  addInheritableOptions(appearances);
  appearances.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const result = await listCardAppearances(client);

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput(result, opts.output) + "\n");
    } else {
      // Flatten for table/csv output
      const rows = result.flatMap((typeEntry) =>
        typeEntry.card_level_appearances.flatMap((levelEntry) =>
          levelEntry.appearances.map((appearance) => ({
            card_type: typeEntry.card_type,
            card_level: levelEntry.card_level,
            design: appearance.design,
            theme: appearance.theme,
            is_active: appearance.is_active,
          })),
        ),
      );
      process.stdout.write(formatOutput(rows, opts.output) + "\n");
    }
  });
}
