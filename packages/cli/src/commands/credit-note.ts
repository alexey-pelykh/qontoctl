// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command } from "commander";
import type { CreditNote } from "@qontoctl/core";
import { createClient } from "../client.js";
import { fetchPaginated } from "../pagination.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../options.js";

export function createCreditNoteCommand(): Command {
  const creditNote = new Command("credit-note").description("Manage credit notes");

  const list = creditNote.command("list").description("List credit notes");
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
    const client = await createClient(opts);

    const result = await fetchPaginated<CreditNote>(client, "/v2/credit_notes", "credit_notes", opts);

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? result.items
        : result.items.map((cn) => ({
            id: cn.id,
            number: cn.number,
            client: cn.client.name || `${cn.client.first_name} ${cn.client.last_name}`.trim(),
            total_amount: `${cn.total_amount.value} ${cn.total_amount.currency}`,
            status: cn.einvoicing_status,
            issue_date: cn.issue_date,
          }));

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  const show = creditNote.command("show <id>").description("Show credit note details");
  addInheritableOptions(show);
  show.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const response = await client.get<{ credit_note: CreditNote }>(`/v2/credit_notes/${encodeURIComponent(id)}`);
    const cn = response.credit_note;

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? cn
        : [
            {
              id: cn.id,
              number: cn.number,
              client: cn.client.name || `${cn.client.first_name} ${cn.client.last_name}`.trim(),
              total_amount: `${cn.total_amount.value} ${cn.total_amount.currency}`,
              vat_amount: `${cn.vat_amount.value} ${cn.vat_amount.currency}`,
              status: cn.einvoicing_status,
              issue_date: cn.issue_date,
              invoice_id: cn.invoice_id,
              currency: cn.currency,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  return creditNote;
}
