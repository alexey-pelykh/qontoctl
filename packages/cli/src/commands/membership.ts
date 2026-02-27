// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command } from "commander";
import type { Membership } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../options.js";

export function createMembershipCommand(): Command {
  const membership = new Command("membership").description("Manage memberships");

  const list = membership.command("list").description("List all memberships");
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
      const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
      const client = await createClient(opts);

      const result = await fetchPaginated<Membership>(client, "/v2/memberships", "memberships", opts);

      const data =
        opts.output === "json" || opts.output === "yaml"
          ? result.items
          : result.items.map((m) => ({
              id: m.id,
              first_name: m.first_name,
              last_name: m.last_name,
              role: m.role,
              team_id: m.team_id,
              status: m.status,
            }));

      process.stdout.write(formatOutput(data, opts.output) + "\n");
    });

  return membership;
}
