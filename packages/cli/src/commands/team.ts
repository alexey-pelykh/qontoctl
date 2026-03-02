// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command } from "commander";
import type { Team } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions, WriteOptions } from "../options.js";

export function createTeamCommand(): Command {
  const team = new Command("team").description("Manage teams");

  const list = team.command("list").description("List all teams");
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
    const client = await createClient(opts);

    const result = await fetchPaginated<Team>(client, "/v2/teams", "teams", opts);

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? result.items
        : result.items.map((t) => ({
            id: t.id,
            name: t.name,
          }));

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- create ---
  const create = team
    .command("create")
    .description("Create a new team")
    .requiredOption("--name <name>", "name for the new team");
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<
      GlobalOptions &
        WriteOptions & {
          readonly name: string;
        }
    >(cmd);
    const client = await createClient(opts);

    const response = await client.post<{ team: Team }>(
      "/v2/teams",
      { name: opts.name },
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    const t = response.team;

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? t
        : [
            {
              id: t.id,
              name: t.name,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  return team;
}
