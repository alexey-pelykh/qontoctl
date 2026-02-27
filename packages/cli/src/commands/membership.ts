// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command } from "commander";
import type { Membership } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import type { GlobalOptions, PaginationOptions } from "../options.js";

export function createMembershipCommand(): Command {
  const membership = new Command("membership").description(
    "Manage memberships",
  );

  membership
    .command("list")
    .description("List all memberships")
    .action(async () => {
      const opts =
        membership.optsWithGlobals<GlobalOptions & PaginationOptions>();
      const client = await createClient(opts);

      const result = await fetchPaginated<Membership>(
        client,
        "/v2/memberships",
        "memberships",
        opts,
      );

      const rows = result.items.map((m) => ({
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        role: m.role,
        team_id: m.team_id,
        status: m.status,
      }));

      process.stdout.write(formatOutput(rows, opts.output) + "\n");
    });

  return membership;
}
