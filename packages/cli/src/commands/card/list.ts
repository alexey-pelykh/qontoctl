// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import { buildCardQueryParams, type Card, type ListCardsParams } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, PaginationOptions } from "../../options.js";
import { fetchPaginated } from "../../pagination.js";

interface CardListOptions extends GlobalOptions, PaginationOptions {
  readonly query?: string | undefined;
  readonly holderId?: string[] | undefined;
  readonly status?: string[] | undefined;
  readonly bankAccountId?: string[] | undefined;
  readonly cardLevel?: string[] | undefined;
  readonly sortBy?: string | undefined;
}

function toTableRow(card: Card): Record<string, unknown> {
  return {
    id: card.id,
    nickname: card.nickname,
    last_digits: card.last_digits,
    status: card.status,
    card_level: card.card_level,
    card_type: card.card_type,
    holder_id: card.holder_id,
  };
}

function buildParams(opts: CardListOptions): ListCardsParams {
  return {
    ...(opts.query !== undefined && { query: opts.query }),
    ...(opts.holderId !== undefined && { holder_ids: opts.holderId }),
    ...(opts.status !== undefined && { statuses: opts.status }),
    ...(opts.bankAccountId !== undefined && { bank_account_ids: opts.bankAccountId }),
    ...(opts.cardLevel !== undefined && { card_levels: opts.cardLevel }),
    ...(opts.sortBy !== undefined && { sort_by: opts.sortBy }),
  };
}

export function registerCardListCommand(parent: Command): void {
  const list = parent
    .command("list")
    .description("List cards")
    .option("--query <text>", "search cards by name, ID, last digits, etc.")
    .addOption(new Option("--holder-id <id...>", "filter by cardholder membership ID"))
    .addOption(
      new Option("--status <status...>", "filter by card status").choices([
        "pending",
        "live",
        "paused",
        "stolen",
        "lost",
        "pin_blocked",
        "discarded",
        "expired",
        "shipped_lost",
        "onhold",
        "order_canceled",
        "pre_expired",
        "abusive",
      ]),
    )
    .addOption(new Option("--bank-account-id <id...>", "filter by bank account ID"))
    .addOption(
      new Option("--card-level <level...>", "filter by card level").choices([
        "standard",
        "plus",
        "metal",
        "virtual",
        "virtual_partner",
        "flash",
        "advertising",
      ]),
    )
    .addOption(new Option("--sort-by <sort>", "sort order (e.g. status:asc, created_at:desc)"));
  addInheritableOptions(list);
  list.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<CardListOptions>(cmd);
    const client = await createClient(opts);

    const params = buildParams(opts);
    const queryParams = buildCardQueryParams(params);

    const result = await fetchPaginated<Card>(client, "/v2/cards", "cards", opts, queryParams);

    const data = opts.output === "table" || opts.output === "csv" ? result.items.map(toTableRow) : result.items;

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
