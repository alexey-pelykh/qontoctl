// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Command, Option } from "commander";
import type { ClientInvoice, ClientInvoiceUpload, QueryParams } from "@qontoctl/core";
import {
  getClientInvoice,
  createClientInvoice,
  updateClientInvoice,
  deleteClientInvoice,
  finalizeClientInvoice,
  sendClientInvoice,
  markClientInvoicePaid,
  unmarkClientInvoicePaid,
  cancelClientInvoice,
  uploadClientInvoiceFile,
  getClientInvoiceUpload,
} from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions, WriteOptions } from "../options.js";
import { parseJson } from "../parse-json.js";

interface ClientInvoiceListOptions extends GlobalOptions, PaginationOptions {
  readonly status?: string | undefined;
  readonly createdAtFrom?: string | undefined;
  readonly createdAtTo?: string | undefined;
  readonly updatedAtFrom?: string | undefined;
  readonly updatedAtTo?: string | undefined;
  readonly dueDate?: string | undefined;
  readonly dueDateFrom?: string | undefined;
  readonly dueDateTo?: string | undefined;
  readonly excludeImported?: true | undefined;
  readonly sortBy?: string | undefined;
}

function buildClientInvoiceListParams(opts: ClientInvoiceListOptions): QueryParams {
  const params: Record<string, string | readonly string[]> = {};

  if (opts.status !== undefined) {
    params["filter[status]"] = opts.status;
  }
  if (opts.createdAtFrom !== undefined) {
    params["filter[created_at_from]"] = opts.createdAtFrom;
  }
  if (opts.createdAtTo !== undefined) {
    params["filter[created_at_to]"] = opts.createdAtTo;
  }
  if (opts.updatedAtFrom !== undefined) {
    params["filter[updated_at_from]"] = opts.updatedAtFrom;
  }
  if (opts.updatedAtTo !== undefined) {
    params["filter[updated_at_to]"] = opts.updatedAtTo;
  }
  if (opts.dueDate !== undefined) {
    params["filter[due_date]"] = opts.dueDate;
  }
  if (opts.dueDateFrom !== undefined) {
    params["filter[due_date_from]"] = opts.dueDateFrom;
  }
  if (opts.dueDateTo !== undefined) {
    params["filter[due_date_to]"] = opts.dueDateTo;
  }
  if (opts.excludeImported !== undefined) {
    params["exclude_imported"] = String(opts.excludeImported);
  }
  if (opts.sortBy !== undefined) {
    params["sort_by"] = opts.sortBy;
  }

  return params;
}

function clientDisplayName(client: ClientInvoice["client"]): string {
  if (client.name !== null) {
    return client.name;
  }
  const parts = [client.first_name, client.last_name].filter((p) => p !== null);
  return parts.length > 0 ? parts.join(" ") : "";
}

function invoiceToTableRow(inv: ClientInvoice): Record<string, string | number> {
  return {
    id: inv.id,
    number: inv.invoice_number ?? "",
    status: inv.status,
    client: clientDisplayName(inv.client),
    total: `${inv.total_amount.value} ${inv.total_amount.currency}`,
    issue_date: inv.issue_date ?? "",
    due_date: inv.due_date ?? "",
  };
}

function uploadToTableRow(u: ClientInvoiceUpload): Record<string, string | number> {
  return {
    id: u.id,
    file_name: u.file_name,
    file_size: u.file_size,
    file_content_type: u.file_content_type,
    created_at: u.created_at,
  };
}

export function createClientInvoiceCommand(): Command {
  const invoice = new Command("client-invoice").description("Manage client invoices");

  // --- list ---
  const list = invoice
    .command("list")
    .description("List client invoices")
    .addOption(new Option("--status <status>", "filter by status").choices(["draft", "pending", "paid", "cancelled"]))
    .addOption(new Option("--created-at-from <date>", "filter by creation date (from, ISO 8601)"))
    .addOption(new Option("--created-at-to <date>", "filter by creation date (to, ISO 8601)"))
    .addOption(new Option("--updated-at-from <date>", "filter by last update date (from, ISO 8601)"))
    .addOption(new Option("--updated-at-to <date>", "filter by last update date (to, ISO 8601)"))
    .addOption(new Option("--due-date <date>", "filter by exact due date (YYYY-MM-DD)"))
    .addOption(new Option("--due-date-from <date>", "filter by due date (from, YYYY-MM-DD)"))
    .addOption(new Option("--due-date-to <date>", "filter by due date (to, YYYY-MM-DD)"))
    .addOption(new Option("--exclude-imported", "exclude imported invoices"))
    .addOption(new Option("--sort-by <field>", "sort field and direction (e.g. 'created_at:desc')"));
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<ClientInvoiceListOptions>(cmd);
    const client = await createClient(opts);

    const params = buildClientInvoiceListParams(opts);
    const result = await fetchPaginated<ClientInvoice>(client, "/v2/client_invoices", "client_invoices", opts, params);

    const data = opts.output === "json" || opts.output === "yaml" ? result.items : result.items.map(invoiceToTableRow);

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- show ---
  const show = invoice.command("show <id>").description("Show client invoice details");
  addInheritableOptions(show);
  show.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const inv = await getClientInvoice(client, id);

    const data = opts.output === "json" || opts.output === "yaml" ? inv : [invoiceToTableRow(inv)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- create ---
  const create = invoice
    .command("create")
    .description("Create a draft client invoice")
    .requiredOption("--body <json>", "invoice data as JSON");
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { body: string }>(cmd);
    const client = await createClient(opts);

    const body: unknown = parseJson(opts.body, "--body");
    const inv = await createClientInvoice(
      client,
      body,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? inv : [invoiceToTableRow(inv)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- update ---
  const update = invoice
    .command("update <id>")
    .description("Update a draft client invoice")
    .requiredOption("--body <json>", "fields to update as JSON");
  addInheritableOptions(update);
  addWriteOptions(update);
  update.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { body: string }>(cmd);
    const client = await createClient(opts);

    const body: unknown = parseJson(opts.body, "--body");
    const inv = await updateClientInvoice(
      client,
      id,
      body,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? inv : [invoiceToTableRow(inv)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- delete ---
  const del = invoice
    .command("delete <id>")
    .description("Delete a draft client invoice")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(del);
  addWriteOptions(del);
  del.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { yes?: true | undefined }>(cmd);
    const client = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to delete client invoice ${id}. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    await deleteClientInvoice(
      client,
      id,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ deleted: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`Client invoice ${id} deleted.\n`);
    }
  });

  // --- finalize ---
  const finalize = invoice.command("finalize <id>").description("Finalize client invoice and assign number");
  addInheritableOptions(finalize);
  finalize.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const inv = await finalizeClientInvoice(client, id);

    const data = opts.output === "json" || opts.output === "yaml" ? inv : [invoiceToTableRow(inv)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- send ---
  const send = invoice.command("send <id>").description("Send client invoice to client via email");
  addInheritableOptions(send);
  send.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    await sendClientInvoice(client, id);

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ sent: true, id }, opts.output) + "\n");
    } else {
      process.stdout.write(`Client invoice ${id} sent.\n`);
    }
  });

  // --- mark-paid ---
  const markPaid = invoice.command("mark-paid <id>").description("Mark client invoice as paid");
  addInheritableOptions(markPaid);
  markPaid.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const inv = await markClientInvoicePaid(client, id);

    const data = opts.output === "json" || opts.output === "yaml" ? inv : [invoiceToTableRow(inv)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- unmark-paid ---
  const unmarkPaid = invoice.command("unmark-paid <id>").description("Unmark client invoice paid status");
  addInheritableOptions(unmarkPaid);
  unmarkPaid.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const inv = await unmarkClientInvoicePaid(client, id);

    const data = opts.output === "json" || opts.output === "yaml" ? inv : [invoiceToTableRow(inv)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- cancel ---
  const cancel = invoice.command("cancel <id>").description("Cancel a finalized client invoice");
  addInheritableOptions(cancel);
  cancel.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const inv = await cancelClientInvoice(client, id);

    const data = opts.output === "json" || opts.output === "yaml" ? inv : [invoiceToTableRow(inv)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- upload ---
  const upload = invoice.command("upload <id> <file>").description("Upload a file to a client invoice");
  addInheritableOptions(upload);
  addWriteOptions(upload);
  upload.action(async (id: string, file: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions>(cmd);
    const client = await createClient(opts);

    const buffer = await readFile(file);
    const fileName = basename(file);

    const result = await uploadClientInvoiceFile(
      client,
      id,
      new Blob([buffer]),
      fileName,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? result : [uploadToTableRow(result)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- upload-show ---
  const uploadShow = invoice
    .command("upload-show <id> <upload-id>")
    .description("Show upload details for a client invoice");
  addInheritableOptions(uploadShow);
  uploadShow.action(async (id: string, uploadId: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const result = await getClientInvoiceUpload(client, id, uploadId);

    const data = opts.output === "json" || opts.output === "yaml" ? result : [uploadToTableRow(result)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  return invoice;
}
