// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command } from "commander";
import type { Label } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import type { GlobalOptions, PaginationOptions } from "../options.js";

export function createLabelCommand(): Command {
  const label = new Command("label").description("Manage labels");

  label
    .command("list")
    .description("List all labels")
    .action(async () => {
      const opts = label.optsWithGlobals<GlobalOptions & PaginationOptions>();
      const client = await createClient(opts);

      const result = await fetchPaginated<Label>(
        client,
        "/v2/labels",
        "labels",
        opts,
      );

      const rows = result.items.map((l) => ({
        id: l.id,
        name: l.name,
        parent_id: l.parent_id ?? "",
      }));

      process.stdout.write(formatOutput(rows, opts.output) + "\n");
    });

  label
    .command("show <id>")
    .description("Show label details")
    .action(async (id: string) => {
      const opts = label.optsWithGlobals<GlobalOptions>();
      const client = await createClient(opts);

      const response = await client.get<{ label: Label }>(`/v2/labels/${id}`);
      const l = response.label;

      const row = {
        id: l.id,
        name: l.name,
        parent_id: l.parent_id ?? "",
      };

      process.stdout.write(formatOutput([row], opts.output) + "\n");
    });

  return label;
}
