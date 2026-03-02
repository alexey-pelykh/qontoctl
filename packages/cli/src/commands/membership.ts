// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import type { Membership } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions, WriteOptions } from "../options.js";

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

  // --- show ---
  const show = membership.command("show").description("Show current user's membership");
  addInheritableOptions(show);
  show.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const response = await client.get<{ membership: Membership }>("/v2/membership");
    const m = response.membership;

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? m
        : [
            {
              id: m.id,
              first_name: m.first_name,
              last_name: m.last_name,
              email: m.email,
              role: m.role,
              team_id: m.team_id,
              status: m.status,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- invite ---
  const invite = membership
    .command("invite")
    .description("Invite a new member")
    .requiredOption("--email <email>", "email address of the invitee")
    .addOption(
      new Option("--role <role>", "role for the new member")
        .choices(["admin", "manager", "reporting", "employee", "accountant"])
        .makeOptionMandatory(),
    )
    .option("--first-name <name>", "first name")
    .option("--last-name <name>", "last name")
    .option("--team-id <id>", "team ID");
  addInheritableOptions(invite);
  addWriteOptions(invite);
  invite.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<
      GlobalOptions &
        WriteOptions & {
          readonly email: string;
          readonly role: string;
          readonly firstName?: string | undefined;
          readonly lastName?: string | undefined;
          readonly teamId?: string | undefined;
        }
    >(cmd);
    const client = await createClient(opts);

    const params: Record<string, string> = {
      email: opts.email,
      role: opts.role,
    };
    if (opts.firstName !== undefined) params["first_name"] = opts.firstName;
    if (opts.lastName !== undefined) params["last_name"] = opts.lastName;
    if (opts.teamId !== undefined) params["team_id"] = opts.teamId;

    const response = await client.post<{ membership: Membership }>(
      "/v2/memberships",
      { membership: params },
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    const m = response.membership;

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? m
        : [
            {
              id: m.id,
              first_name: m.first_name,
              last_name: m.last_name,
              email: m.email,
              role: m.role,
              team_id: m.team_id,
              status: m.status,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  return membership;
}
