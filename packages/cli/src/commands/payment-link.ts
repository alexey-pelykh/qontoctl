// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import type { PaymentLink, PaymentLinkPayment, QueryParams } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions, WriteOptions } from "../options.js";

interface PaymentLinkListOptions extends GlobalOptions, PaginationOptions {
  readonly status?: string | undefined;
  readonly sortBy?: string | undefined;
}

function buildPaymentLinkListParams(opts: PaymentLinkListOptions): QueryParams {
  const params: Record<string, string> = {};

  if (opts.status !== undefined) {
    params["status[]"] = opts.status;
  }
  if (opts.sortBy !== undefined) {
    params["sort_by"] = opts.sortBy;
  }

  return params;
}

function paymentLinkToTableRow(pl: PaymentLink): Record<string, string | boolean> {
  return {
    id: pl.id,
    status: pl.status,
    amount: `${pl.amount.value} ${pl.amount.currency}`,
    resource_type: pl.resource_type,
    reusable: pl.reusable,
    url: pl.url,
    expiration_date: pl.expiration_date,
  };
}

function paymentToTableRow(p: PaymentLinkPayment): Record<string, string> {
  return {
    id: p.id,
    status: p.status,
    amount: `${p.amount.value} ${p.amount.currency}`,
    payment_method: p.payment_method,
    debitor_email: p.debitor_email,
    paid_at: p.paid_at ?? "",
  };
}

export function createPaymentLinkCommand(): Command {
  const paymentLink = new Command("payment-link").description("Manage payment links");

  // --- list ---
  const list = paymentLink
    .command("list")
    .description("List payment links")
    .addOption(
      new Option("--status <status>", "filter by status").choices([
        "open",
        "expired",
        "canceled",
        "paid",
        "processing",
      ]),
    )
    .addOption(
      new Option("--sort-by <sort>", "sort order").choices([
        "amount:asc",
        "amount:desc",
        "expiration_date:asc",
        "expiration_date:desc",
      ]),
    );
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<PaymentLinkListOptions>(cmd);
    const client = await createClient(opts);

    const params = buildPaymentLinkListParams(opts);
    const result = await fetchPaginated<PaymentLink>(client, "/v2/payment_links", "payment_links", opts, params);

    const data =
      opts.output === "json" || opts.output === "yaml" ? result.items : result.items.map(paymentLinkToTableRow);

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- show ---
  const show = paymentLink.command("show <id>").description("Show payment link details");
  addInheritableOptions(show);
  show.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const response = await client.get<{ payment_link: PaymentLink }>(`/v2/payment_links/${encodeURIComponent(id)}`);
    const pl = response.payment_link;

    const data = opts.output === "json" || opts.output === "yaml" ? pl : [paymentLinkToTableRow(pl)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- create ---
  const create = paymentLink
    .command("create")
    .description("Create a new payment link")
    .requiredOption("--body <json>", "payment link data as JSON");
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { body: string }>(cmd);
    const client = await createClient(opts);

    const body: unknown = JSON.parse(opts.body);
    const response = await client.post<{ payment_link: PaymentLink }>(
      "/v2/payment_links",
      body,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    const pl = response.payment_link;

    const data = opts.output === "json" || opts.output === "yaml" ? pl : [paymentLinkToTableRow(pl)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- deactivate ---
  const deactivate = paymentLink
    .command("deactivate <id>")
    .description("Deactivate a payment link")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(deactivate);
  deactivate.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & { yes?: true | undefined }>(cmd);
    const client = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to deactivate payment link ${id}. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    const response = await client.request<{ payment_link: PaymentLink }>(
      "PATCH",
      `/v2/payment_links/${encodeURIComponent(id)}/deactivate`,
    );
    const pl = response.payment_link;

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput(pl, opts.output) + "\n");
    } else {
      process.stdout.write(`Payment link ${id} deactivated.\n`);
    }
  });

  // --- payments ---
  const payments = paymentLink.command("payments <id>").description("List payments for a payment link");
  addInheritableOptions(payments);
  payments.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
    const client = await createClient(opts);

    const result = await fetchPaginated<PaymentLinkPayment>(
      client,
      `/v2/payment_links/${encodeURIComponent(id)}/payments`,
      "payments",
      opts,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? result.items : result.items.map(paymentToTableRow);

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- methods ---
  const methods = paymentLink.command("methods").description("List available payment methods");
  addInheritableOptions(methods);
  methods.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const response = await client.get<{
      payment_link_payment_methods: { name: string; enabled: boolean }[];
    }>("/v2/payment_links/payment_methods");

    const items = response.payment_link_payment_methods;

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? items
        : items.map((m) => ({
            name: m.name,
            enabled: m.enabled,
          }));

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- connect ---
  const connect = paymentLink
    .command("connect")
    .description("Establish payment link connection")
    .requiredOption("--body <json>", "connection data as JSON");
  addInheritableOptions(connect);
  addWriteOptions(connect);
  connect.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { body: string }>(cmd);
    const client = await createClient(opts);

    const body: unknown = JSON.parse(opts.body);
    const response = await client.post<{
      connection_location: string;
      status: string;
      bank_account_id: string;
    }>(
      "/v2/payment_links/connections",
      body,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? response
        : [
            {
              connection_location: response.connection_location,
              status: response.status,
              bank_account_id: response.bank_account_id,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- connection-status ---
  const connectionStatus = paymentLink.command("connection-status").description("Show connection status");
  addInheritableOptions(connectionStatus);
  connectionStatus.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const response = await client.get<{
      connection_location: string;
      status: string;
      bank_account_id: string;
    }>("/v2/payment_links/connections");

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? response
        : [
            {
              connection_location: response.connection_location,
              status: response.status,
              bank_account_id: response.bank_account_id,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  return paymentLink;
}
