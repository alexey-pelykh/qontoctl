// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import type { WebhookSubscription } from "@qontoctl/core";
import { getWebhook, createWebhook, updateWebhook, deleteWebhook } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions, WriteOptions } from "../options.js";

function toTableRow(w: WebhookSubscription): Record<string, string> {
  return {
    id: w.id,
    url: w.url,
    event_types: w.event_types.join(", "),
    status: w.status,
  };
}

export function createWebhookCommand(): Command {
  const webhook = new Command("webhook").description("Manage webhook subscriptions");

  // --- list ---
  const list = webhook.command("list").description("List webhook subscriptions");
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
    const client = await createClient(opts);

    const result = await fetchPaginated<WebhookSubscription>(
      client,
      "/v2/webhook_subscriptions",
      "webhook_subscriptions",
      opts,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? result.items : result.items.map(toTableRow);

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- show ---
  const show = webhook.command("show <id>").description("Show webhook subscription details");
  addInheritableOptions(show);
  show.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const w = await getWebhook(client, id);

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? w
        : [
            {
              id: w.id,
              url: w.url,
              event_types: w.event_types.join(", "),
              status: w.status,
              created_at: w.created_at,
              updated_at: w.updated_at,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- create ---
  const create = webhook
    .command("create")
    .description("Create a webhook subscription")
    .addOption(new Option("--url <url>", "callback URL for webhook delivery").makeOptionMandatory())
    .addOption(new Option("--events <types...>", "event types to subscribe to").makeOptionMandatory());
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<
      GlobalOptions &
        WriteOptions & {
          readonly url: string;
          readonly events: string[];
        }
    >(cmd);
    const client = await createClient(opts);

    const w = await createWebhook(
      client,
      { url: opts.url, event_types: opts.events },
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? w : [toTableRow(w)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- update ---
  const update = webhook
    .command("update <id>")
    .description("Update a webhook subscription")
    .option("--url <url>", "callback URL for webhook delivery")
    .option("--events <types...>", "event types to subscribe to");
  addInheritableOptions(update);
  addWriteOptions(update);
  update.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<
      GlobalOptions &
        WriteOptions & {
          readonly url?: string | undefined;
          readonly events?: string[] | undefined;
        }
    >(cmd);
    const client = await createClient(opts);

    const params = {
      ...(opts.url !== undefined ? { url: opts.url } : {}),
      ...(opts.events !== undefined ? { event_types: opts.events } : {}),
    };

    const w = await updateWebhook(
      client,
      id,
      params,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? w : [toTableRow(w)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- delete ---
  const del = webhook
    .command("delete <id>")
    .description("Delete a webhook subscription")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(del);
  addWriteOptions(del);
  del.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { yes?: true | undefined }>(cmd);
    const httpClient = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to delete webhook subscription ${id}. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    await deleteWebhook(
      httpClient,
      id,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ deleted: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`Webhook subscription ${id} deleted.\n`);
    }
  });

  return webhook;
}
