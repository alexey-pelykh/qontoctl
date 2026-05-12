// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Command, Option } from "commander";
import type { Terminal, TerminalAmount, TerminalPayment } from "@qontoctl/core";
import { createTerminalPayment } from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, PaginationOptions, WriteOptions } from "../options.js";
import { fetchPaginated } from "../pagination.js";
import { parseJson } from "../parse-json.js";

const SUPPORTED_CURRENCIES = ["EUR"] as const;
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Validate a terminal-payment decimal amount.
 *
 * The Qonto API accepts `0.10` – `100000.00` as a decimal string and rejects
 * floating-point JSON numbers. We normalize to a 2-decimal canonical form so
 * the user can type `12`, `12.5`, or `12.50` and the API receives `12.50`.
 */
function parseTerminalAmount(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Expected a decimal amount with up to 2 decimal places (e.g. "12.50"), got "${value}".`);
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0.1 || numeric > 100_000) {
    throw new Error(`Expected an amount between 0.10 and 100000.00, got "${value}".`);
  }
  // Normalize to a canonical "X.YY" decimal string.
  return numeric.toFixed(2);
}

function toTerminalRow(t: Terminal): Record<string, string> {
  return {
    id: t.id,
    poi_id: t.poi_id,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

function toPaymentRow(p: TerminalPayment): Record<string, string> {
  return {
    id: p.id,
    terminal_id: p.terminal_id,
    amount: `${p.amount.value} ${p.amount.currency}`,
    created_at: p.created_at,
  };
}

export function createTerminalCommand(): Command {
  const terminal = new Command("terminal").description("Manage Qonto Terminals (POS) and initiate terminal payments");

  // --- list ---
  const list = terminal.command("list").description("List Qonto Terminals linked to the organization");
  addInheritableOptions(list);
  list.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & PaginationOptions>(cmd);
    const client = await createClient(opts);

    const result = await fetchPaginated<Terminal>(client, "/v2/terminals", "terminals", opts);

    const data = opts.output === "json" || opts.output === "yaml" ? result.items : result.items.map(toTerminalRow);

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- payment (subcommand group) ---
  const payment = terminal.command("payment").description("Manage terminal payments");

  // --- payment create ---
  const create = payment
    .command("create <terminal-id>")
    .description("Initiate a payment on a terminal (returns 202 Accepted)")
    .addOption(
      new Option("--amount <amount>", "payment amount (decimal string, 0.10–100000.00)")
        .argParser(parseTerminalAmount)
        .makeOptionMandatory(),
    )
    .addOption(
      new Option("--currency <code>", "ISO 4217 currency code (Qonto Terminals: EUR only)")
        .choices([...SUPPORTED_CURRENCIES])
        .default("EUR"),
    )
    .addOption(new Option("--metadata <json>", "free-form JSON metadata (max 1 KB, echoed back in response)"));
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (terminalId: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<
      GlobalOptions &
        WriteOptions & {
          readonly amount: string;
          readonly currency: SupportedCurrency;
          readonly metadata?: string | undefined;
        }
    >(cmd);
    const client = await createClient(opts);

    const amount: TerminalAmount = { value: opts.amount, currency: opts.currency };
    const metadata =
      opts.metadata !== undefined ? (parseJson(opts.metadata, "--metadata") as Record<string, unknown>) : undefined;

    const result = await createTerminalPayment(
      client,
      terminalId,
      {
        amount,
        ...(metadata !== undefined ? { metadata } : {}),
      },
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? result : [toPaymentRow(result)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  return terminal;
}
