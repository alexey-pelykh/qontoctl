// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { buildSupplierInvoiceQueryParams, type ListSupplierInvoicesParams, type SupplierInvoice } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../../options.js";
import { fetchPaginated } from "../../pagination.js";

interface SupplierInvoiceListOptions extends GlobalOptions, PaginationOptions {
  readonly status?: string[] | undefined;
  readonly dueDateFilter?: string | undefined;
  readonly createdFrom?: string | undefined;
  readonly createdTo?: string | undefined;
  readonly updatedFrom?: string | undefined;
  readonly updatedTo?: string | undefined;
  readonly query?: string | undefined;
  readonly sortBy?: string | undefined;
}

const SUPPLIER_INVOICE_STATUSES = [
  "to_review",
  "to_approve",
  "awaiting_payment",
  "pending",
  "scheduled",
  "paid",
  "archived",
  "rejected",
  "discarded",
] as const;

function toTableRow(inv: SupplierInvoice): Record<string, string | null> {
  return {
    id: inv.id,
    supplier_name: inv.supplier_name,
    invoice_number: inv.invoice_number,
    total_amount: inv.total_amount !== null ? `${inv.total_amount.value} ${inv.total_amount.currency}` : null,
    status: inv.status,
    due_date: inv.due_date,
  };
}

function buildParams(opts: SupplierInvoiceListOptions): ListSupplierInvoicesParams {
  return {
    ...(opts.status !== undefined && { status: opts.status }),
    ...(opts.dueDateFilter !== undefined && { due_date: opts.dueDateFilter }),
    ...(opts.createdFrom !== undefined && { created_at_from: opts.createdFrom }),
    ...(opts.createdTo !== undefined && { created_at_to: opts.createdTo }),
    ...(opts.updatedFrom !== undefined && { updated_at_from: opts.updatedFrom }),
    ...(opts.updatedTo !== undefined && { updated_at_to: opts.updatedTo }),
    ...(opts.query !== undefined && { query: opts.query }),
    ...(opts.sortBy !== undefined && { sort_by: opts.sortBy }),
  };
}

export function registerSupplierInvoiceListCommand(parent: Command): void {
  const list = parent
    .command("list")
    .description("List supplier invoices")
    .addOption(new Option("--status <status...>", "filter by status").choices([...SUPPLIER_INVOICE_STATUSES]))
    .addOption(
      new Option("--due-date-filter <filter>", "filter by due date").choices([
        "past_and_today",
        "future",
        "missing_date",
      ]),
    )
    .addOption(new Option("--created-from <date>", "filter by creation date start (ISO 8601)"))
    .addOption(new Option("--created-to <date>", "filter by creation date end (ISO 8601)"))
    .addOption(new Option("--updated-from <date>", "filter by update date start (ISO 8601)"))
    .addOption(new Option("--updated-to <date>", "filter by update date end (ISO 8601)"))
    .addOption(new Option("--query <text>", "full-text search"))
    .addOption(new Option("--sort-by <sort>", "sort order (e.g. created_at:desc)"));
  addInheritableOptions(list);
  list.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<SupplierInvoiceListOptions>(cmd);
    const client = await createClient(opts);

    const params = buildParams(opts);
    const queryParams = buildSupplierInvoiceQueryParams(params);

    const result = await fetchPaginated<SupplierInvoice>(
      client,
      "/v2/supplier_invoices",
      "supplier_invoices",
      opts,
      queryParams,
    );

    const data = opts.output === "table" || opts.output === "csv" ? result.items.map(toTableRow) : result.items;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
