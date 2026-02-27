// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command } from "commander";
import type { Label } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../options.js";

export function createLabelCommand(): Command {
  const label = new Command("label").description("Manage labels");

  const list = label.command("list").description("List all labels");
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
      const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
      const client = await createClient(opts);

      const result = await fetchPaginated<Label>(client, "/v2/labels", "labels", opts);

      const data =
        opts.output === "json" || opts.output === "yaml"
          ? result.items
          : result.items.map((l) => ({
              id: l.id,
              name: l.name,
              parent_id: l.parent_id ?? "",
            }));

      process.stdout.write(formatOutput(data, opts.output) + "\n");
    });

  const show = label.command("show <id>").description("Show label details");
  addInheritableOptions(show);
  show.action(async (id: string, _options: unknown, cmd: Command) => {
      const opts = resolveGlobalOptions<GlobalOptions>(cmd);
      const client = await createClient(opts);

      const response = await client.get<{ label: Label }>(`/v2/labels/${encodeURIComponent(id)}`);
      const l = response.label;

      const data =
        opts.output === "json" || opts.output === "yaml"
          ? l
          : [
              {
                id: l.id,
                name: l.name,
                parent_id: l.parent_id ?? "",
              },
            ];

      process.stdout.write(formatOutput(data, opts.output) + "\n");
    });

  return label;
}
