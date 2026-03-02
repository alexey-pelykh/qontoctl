// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import type { Client } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions, WriteOptions } from "../options.js";

interface ClientCreateOptions extends GlobalOptions, WriteOptions {
  readonly kind: string;
  readonly name?: string | undefined;
  readonly firstName?: string | undefined;
  readonly lastName?: string | undefined;
  readonly email?: string | undefined;
  readonly address?: string | undefined;
  readonly city?: string | undefined;
  readonly zipCode?: string | undefined;
  readonly countryCode?: string | undefined;
  readonly vatNumber?: string | undefined;
  readonly taxIdentificationNumber?: string | undefined;
  readonly locale?: string | undefined;
  readonly currency?: string | undefined;
}

interface ClientUpdateOptions extends GlobalOptions, WriteOptions {
  readonly name?: string | undefined;
  readonly firstName?: string | undefined;
  readonly lastName?: string | undefined;
  readonly email?: string | undefined;
  readonly address?: string | undefined;
  readonly city?: string | undefined;
  readonly zipCode?: string | undefined;
  readonly countryCode?: string | undefined;
  readonly vatNumber?: string | undefined;
  readonly taxIdentificationNumber?: string | undefined;
  readonly locale?: string | undefined;
  readonly currency?: string | undefined;
}

function clientDisplayName(c: Client): string {
  if (c.name !== null) {
    return c.name;
  }
  const parts = [c.first_name, c.last_name].filter((p) => p !== null);
  return parts.length > 0 ? parts.join(" ") : "";
}

function clientToTableRow(c: Client): Record<string, string> {
  return {
    id: c.id,
    name: clientDisplayName(c),
    kind: c.kind,
    email: c.email ?? "",
  };
}

export function createClientCommand(): Command {
  const client = new Command("client").description("Manage clients");

  // --- list ---
  const list = client.command("list").description("List clients");
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
    const httpClient = await createClient(opts);

    const result = await fetchPaginated<Client>(httpClient, "/v2/clients", "clients", opts);

    const data =
      opts.output === "json" || opts.output === "yaml" ? result.items : result.items.map(clientToTableRow);

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- show ---
  const show = client.command("show <id>").description("Show client details");
  addInheritableOptions(show);
  show.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const httpClient = await createClient(opts);

    const response = await httpClient.get<{ client: Client }>(`/v2/clients/${encodeURIComponent(id)}`);
    const c = response.client;

    const data = opts.output === "json" || opts.output === "yaml" ? c : [clientToTableRow(c)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- create ---
  const create = client
    .command("create")
    .description("Create a new client")
    .addOption(
      new Option("--kind <kind>", "client kind").choices(["company", "individual", "freelancer"]).makeOptionMandatory(),
    )
    .option("--name <name>", "client name (required for company)")
    .option("--first-name <name>", "first name (required for individual/freelancer)")
    .option("--last-name <name>", "last name (required for individual/freelancer)")
    .option("--email <email>", "email address")
    .option("--address <address>", "street address")
    .option("--city <city>", "city")
    .option("--zip-code <code>", "postal/zip code")
    .option("--country-code <code>", "ISO 3166-1 alpha-2 country code")
    .option("--vat-number <number>", "VAT number")
    .option("--tax-identification-number <number>", "tax identification number")
    .option("--locale <locale>", "locale (e.g. en, fr)")
    .option("--currency <currency>", "currency code (ISO 4217)");
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<ClientCreateOptions>(cmd);
    const httpClient = await createClient(opts);

    const params: Record<string, string> = {
      kind: opts.kind,
    };
    if (opts.name !== undefined) params["name"] = opts.name;
    if (opts.firstName !== undefined) params["first_name"] = opts.firstName;
    if (opts.lastName !== undefined) params["last_name"] = opts.lastName;
    if (opts.email !== undefined) params["email"] = opts.email;
    if (opts.address !== undefined) params["address"] = opts.address;
    if (opts.city !== undefined) params["city"] = opts.city;
    if (opts.zipCode !== undefined) params["zip_code"] = opts.zipCode;
    if (opts.countryCode !== undefined) params["country_code"] = opts.countryCode;
    if (opts.vatNumber !== undefined) params["vat_number"] = opts.vatNumber;
    if (opts.taxIdentificationNumber !== undefined) params["tax_identification_number"] = opts.taxIdentificationNumber;
    if (opts.locale !== undefined) params["locale"] = opts.locale;
    if (opts.currency !== undefined) params["currency"] = opts.currency;

    const response = await httpClient.post<{ client: Client }>(
      "/v2/clients",
      params,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    const c = response.client;

    const data = opts.output === "json" || opts.output === "yaml" ? c : [clientToTableRow(c)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- update ---
  const update = client
    .command("update <id>")
    .description("Update a client")
    .option("--name <name>", "client name")
    .option("--first-name <name>", "first name")
    .option("--last-name <name>", "last name")
    .option("--email <email>", "email address")
    .option("--address <address>", "street address")
    .option("--city <city>", "city")
    .option("--zip-code <code>", "postal/zip code")
    .option("--country-code <code>", "ISO 3166-1 alpha-2 country code")
    .option("--vat-number <number>", "VAT number")
    .option("--tax-identification-number <number>", "tax identification number")
    .option("--locale <locale>", "locale (e.g. en, fr)")
    .option("--currency <currency>", "currency code (ISO 4217)");
  addInheritableOptions(update);
  addWriteOptions(update);
  update.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<ClientUpdateOptions>(cmd);
    const httpClient = await createClient(opts);

    const params: Record<string, string> = {};
    if (opts.name !== undefined) params["name"] = opts.name;
    if (opts.firstName !== undefined) params["first_name"] = opts.firstName;
    if (opts.lastName !== undefined) params["last_name"] = opts.lastName;
    if (opts.email !== undefined) params["email"] = opts.email;
    if (opts.address !== undefined) params["address"] = opts.address;
    if (opts.city !== undefined) params["city"] = opts.city;
    if (opts.zipCode !== undefined) params["zip_code"] = opts.zipCode;
    if (opts.countryCode !== undefined) params["country_code"] = opts.countryCode;
    if (opts.vatNumber !== undefined) params["vat_number"] = opts.vatNumber;
    if (opts.taxIdentificationNumber !== undefined) params["tax_identification_number"] = opts.taxIdentificationNumber;
    if (opts.locale !== undefined) params["locale"] = opts.locale;
    if (opts.currency !== undefined) params["currency"] = opts.currency;

    const response = await httpClient.patch<{ client: Client }>(
      `/v2/clients/${encodeURIComponent(id)}`,
      params,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    const c = response.client;

    const data = opts.output === "json" || opts.output === "yaml" ? c : [clientToTableRow(c)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- delete ---
  const del = client
    .command("delete <id>")
    .description("Delete a client")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(del);
  addWriteOptions(del);
  del.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { yes?: true | undefined }>(cmd);
    const httpClient = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to delete client ${id}. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    await httpClient.delete(
      `/v2/clients/${encodeURIComponent(id)}`,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ deleted: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`Client ${id} deleted.\n`);
    }
  });

  return client;
}
