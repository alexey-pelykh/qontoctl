// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { getSupplierInvoice } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions } from "../../options.js";

export function registerSupplierInvoiceShowCommand(parent: Command): void {
  const show = parent.command("show <id>").description("Show supplier invoice details");
  addInheritableOptions(show);
  show.action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const invoice = await getSupplierInvoice(client, id);

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? invoice
        : [
            {
              id: invoice.id,
              supplier_name: invoice.supplier_name,
              invoice_number: invoice.invoice_number,
              total_amount:
                invoice.total_amount !== null ? `${invoice.total_amount.value} ${invoice.total_amount.currency}` : null,
              status: invoice.status,
              due_date: invoice.due_date,
              issue_date: invoice.issue_date,
              payment_date: invoice.payment_date,
              file_name: invoice.file_name,
              is_einvoice: invoice.is_einvoice,
              created_at: invoice.created_at,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
