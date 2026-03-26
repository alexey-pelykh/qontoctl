// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import type { Quote, QueryParams } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions, WriteOptions } from "../options.js";
import { parseJson } from "../parse-json.js";

interface QuoteListOptions extends GlobalOptions, PaginationOptions {
  readonly status?: string | undefined;
  readonly createdFrom?: string | undefined;
  readonly createdTo?: string | undefined;
  readonly sortBy?: string | undefined;
}

function buildQuoteListParams(opts: QuoteListOptions): QueryParams {
  const params: Record<string, string> = {};

  if (opts.status !== undefined) {
    params["filter[status]"] = opts.status;
  }
  if (opts.createdFrom !== undefined) {
    params["filter[created_at_from]"] = opts.createdFrom;
  }
  if (opts.createdTo !== undefined) {
    params["filter[created_at_to]"] = opts.createdTo;
  }
  if (opts.sortBy !== undefined) {
    params["sort_by"] = opts.sortBy;
  }

  return params;
}

function clientDisplayName(client: Quote["client"]): string {
  if (client.name !== null) {
    return client.name;
  }
  const parts = [client.first_name, client.last_name].filter((p) => p !== null);
  return parts.length > 0 ? parts.join(" ") : "";
}

function quoteToTableRow(q: Quote): Record<string, string | number> {
  return {
    id: q.id,
    number: q.number,
    status: q.status,
    client: clientDisplayName(q.client),
    total: `${q.total_amount.value} ${q.total_amount.currency}`,
    issue_date: q.issue_date,
    expiry_date: q.expiry_date,
  };
}

export function createQuoteCommand(): Command {
  const quote = new Command("quote").description("Manage quotes");

  // --- list ---
  const list = quote
    .command("list")
    .description("List quotes")
    .addOption(
      new Option("--status <status>", "filter by status").choices(["pending_approval", "approved", "canceled"]),
    )
    .addOption(new Option("--created-from <datetime>", "filter by creation date start (ISO 8601)"))
    .addOption(new Option("--created-to <datetime>", "filter by creation date end (ISO 8601)"))
    .addOption(new Option("--sort-by <sort>", "sort order").choices(["created_at:asc", "created_at:desc"]));
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<QuoteListOptions>(cmd);
    const client = await createClient(opts);

    const params = buildQuoteListParams(opts);
    const result = await fetchPaginated<Quote>(client, "/v2/quotes", "quotes", opts, params);

    const data = opts.output === "json" || opts.output === "yaml" ? result.items : result.items.map(quoteToTableRow);

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- show ---
  const show = quote.command("show <id>").description("Show quote details");
  addInheritableOptions(show);
  show.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const response = await client.get<{ quote: Quote }>(`/v2/quotes/${encodeURIComponent(id)}`);
    const q = response.quote;

    const data = opts.output === "json" || opts.output === "yaml" ? q : [quoteToTableRow(q)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- create ---
  const create = quote
    .command("create")
    .description("Create a new quote")
    .requiredOption("--body <json>", "quote data as JSON");
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { body: string }>(cmd);
    const client = await createClient(opts);

    const body: unknown = parseJson(opts.body, "--body");
    const response = await client.post<{ quote: Quote }>(
      "/v2/quotes",
      body,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    const q = response.quote;

    const data = opts.output === "json" || opts.output === "yaml" ? q : [quoteToTableRow(q)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- update ---
  const update = quote
    .command("update <id>")
    .description("Update a quote")
    .requiredOption("--body <json>", "fields to update as JSON");
  addInheritableOptions(update);
  addWriteOptions(update);
  update.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { body: string }>(cmd);
    const client = await createClient(opts);

    const body: unknown = parseJson(opts.body, "--body");
    const response = await client.patch<{ quote: Quote }>(
      `/v2/quotes/${encodeURIComponent(id)}`,
      body,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    const q = response.quote;

    const data = opts.output === "json" || opts.output === "yaml" ? q : [quoteToTableRow(q)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- delete ---
  const del = quote
    .command("delete <id>")
    .description("Delete a quote")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(del);
  addWriteOptions(del);
  del.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { yes?: true | undefined }>(cmd);
    const client = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to delete quote ${id}. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    await client.delete(
      `/v2/quotes/${encodeURIComponent(id)}`,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ deleted: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`Quote ${id} deleted.\n`);
    }
  });

  // --- send ---
  const send = quote.command("send <id>").description("Send quote to client via email");
  addInheritableOptions(send);
  send.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    await client.requestVoid("POST", `/v2/quotes/${encodeURIComponent(id)}/send`);

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ sent: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`Quote ${id} sent.\n`);
    }
  });

  return quote;
}
