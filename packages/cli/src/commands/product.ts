// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import type { Product } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../options.js";
import { fetchPaginated } from "../pagination.js";

interface ProductListOptions extends GlobalOptions, PaginationOptions {
  readonly sortBy?: string | undefined;
}

function toProductRow(p: Product): Record<string, string> {
  return {
    id: p.id,
    title: p.title ?? "",
    type: p.type ?? "",
    unit_price: p.unit_price !== undefined ? `${p.unit_price.value} ${p.unit_price.currency}` : "",
    vat_rate: p.vat_rate ?? "",
    updated_at: p.updated_at ?? "",
  };
}

export function createProductCommand(): Command {
  const product = new Command("product").description("Manage Qonto products");

  const list = product.command("list").description("List products in the organization's catalogue");
  list.addOption(new Option("--sort-by <sort>", "sort order (e.g. created_at:desc, title:asc)"));
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<ProductListOptions>(cmd);
    const client = await createClient(opts);

    const query = opts.sortBy !== undefined ? { sort_by: opts.sortBy } : undefined;
    const result = await fetchPaginated<Product>(client, "/v2/products", "products", opts, query);

    const data = opts.output === "json" || opts.output === "yaml" ? result.items : result.items.map(toProductRow);

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  return product;
}
