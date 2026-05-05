// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { Option } from "commander";
import { createCard, type Card, type CreateCardParams } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { parseJson } from "../../parse-json.js";
import { parseAmount, parseBool } from "../../parsers.js";
import { executeWithCliSca } from "../../sca.js";

interface CardCreateOptions extends GlobalOptions, WriteOptions {
  readonly holderId: string;
  readonly initiatorId: string;
  readonly organizationId: string;
  readonly bankAccountId: string;
  readonly cardLevel: string;
  readonly shipToBusiness?: true | undefined;
  readonly atmOption?: boolean | undefined;
  readonly nfcOption?: boolean | undefined;
  readonly foreignOption?: boolean | undefined;
  readonly onlineOption?: boolean | undefined;
  readonly atmMonthlyLimit?: number | undefined;
  readonly atmDailyLimitOption?: boolean | undefined;
  readonly atmDailyLimit?: number | undefined;
  readonly paymentMonthlyLimit?: number | undefined;
  readonly paymentDailyLimitOption?: boolean | undefined;
  readonly paymentDailyLimit?: number | undefined;
  readonly paymentTransactionLimitOption?: boolean | undefined;
  readonly paymentTransactionLimit?: number | undefined;
  readonly paymentLifespanLimit?: number | undefined;
  readonly preExpiresAt?: string | undefined;
  readonly activeDays?: number[] | undefined;
  readonly categories?: string[] | undefined;
  readonly cardDesign?: string | undefined;
  readonly typeOfPrint?: string | undefined;
}

function formatCard(card: Card, output: string): unknown {
  if (output === "json" || output === "yaml") return card;
  return [
    {
      id: card.id,
      nickname: card.nickname,
      status: card.status,
      card_level: card.card_level,
      card_type: card.card_type,
      holder_id: card.holder_id,
    },
  ];
}

export function registerCardCreateCommand(parent: Command): void {
  const create = parent
    .command("create")
    .description("Create a new card")
    .addOption(new Option("--holder-id <id>", "cardholder membership ID").makeOptionMandatory())
    .addOption(new Option("--initiator-id <id>", "order initiator membership ID").makeOptionMandatory())
    .addOption(new Option("--organization-id <id>", "organization ID").makeOptionMandatory())
    .addOption(new Option("--bank-account-id <id>", "bank account ID").makeOptionMandatory())
    .addOption(
      new Option("--card-level <level>", "card level")
        .choices(["standard", "plus", "metal", "virtual", "virtual_partner", "flash", "advertising"])
        .makeOptionMandatory(),
    )
    .addOption(new Option("--ship-to-business", "ship card to organization address"))
    .addOption(new Option("--atm-option <bool>", "enable ATM withdrawals (true/false)").argParser(parseBool))
    .addOption(new Option("--nfc-option <bool>", "enable contactless payments (true/false)").argParser(parseBool))
    .addOption(new Option("--foreign-option <bool>", "enable international payments (true/false)").argParser(parseBool))
    .addOption(new Option("--online-option <bool>", "enable online payments (true/false)").argParser(parseBool))
    .addOption(new Option("--atm-monthly-limit <amount>", "monthly ATM withdrawal limit (EUR)").argParser(parseAmount))
    .addOption(
      new Option("--atm-daily-limit-option <bool>", "enable daily ATM limit (true/false)").argParser(parseBool),
    )
    .addOption(new Option("--atm-daily-limit <amount>", "daily ATM withdrawal limit (EUR)").argParser(parseAmount))
    .addOption(new Option("--payment-monthly-limit <amount>", "monthly payment limit (EUR)").argParser(parseAmount))
    .addOption(
      new Option("--payment-daily-limit-option <bool>", "enable daily payment limit (true/false)").argParser(parseBool),
    )
    .addOption(new Option("--payment-daily-limit <amount>", "daily payment limit (EUR)").argParser(parseAmount))
    .addOption(
      new Option("--payment-transaction-limit-option <bool>", "enable per-transaction limit (true/false)").argParser(
        parseBool,
      ),
    )
    .addOption(new Option("--payment-transaction-limit <amount>", "per-transaction limit (EUR)").argParser(parseAmount))
    .addOption(
      new Option("--payment-lifespan-limit <amount>", "total spending cap (flash cards, EUR)").argParser(parseAmount),
    )
    .option("--pre-expires-at <datetime>", "flash card validity end (ISO 8601)")
    .addOption(
      new Option("--active-days <days...>", "active weekdays (1=Monday, 7=Sunday)").argParser(
        (value: string, previous: number[] | undefined) => {
          const parsed = Number(value);
          if (!Number.isFinite(parsed)) {
            throw new Error(`Expected a numeric weekday (1-7), got "${value}".`);
          }
          return [...(previous ?? []), parsed];
        },
      ),
    )
    .option("--categories <categories...>", "allowed merchant categories")
    .option("--card-design <design>", "card design identifier")
    .addOption(new Option("--type-of-print <type>", "print type").choices(["print", "embossed"]));
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<CardCreateOptions>(cmd);
    const client = await createClient(opts);

    const params: CreateCardParams = {
      holder_id: opts.holderId,
      initiator_id: opts.initiatorId,
      organization_id: opts.organizationId,
      bank_account_id: opts.bankAccountId,
      card_level: opts.cardLevel,
      ...(opts.shipToBusiness !== undefined ? { ship_to_business: true } : {}),
      ...(opts.atmOption !== undefined ? { atm_option: opts.atmOption } : {}),
      ...(opts.nfcOption !== undefined ? { nfc_option: opts.nfcOption } : {}),
      ...(opts.foreignOption !== undefined ? { foreign_option: opts.foreignOption } : {}),
      ...(opts.onlineOption !== undefined ? { online_option: opts.onlineOption } : {}),
      ...(opts.atmMonthlyLimit !== undefined ? { atm_monthly_limit: opts.atmMonthlyLimit } : {}),
      ...(opts.atmDailyLimitOption !== undefined ? { atm_daily_limit_option: opts.atmDailyLimitOption } : {}),
      ...(opts.atmDailyLimit !== undefined ? { atm_daily_limit: opts.atmDailyLimit } : {}),
      ...(opts.paymentMonthlyLimit !== undefined ? { payment_monthly_limit: opts.paymentMonthlyLimit } : {}),
      ...(opts.paymentDailyLimitOption !== undefined
        ? { payment_daily_limit_option: opts.paymentDailyLimitOption }
        : {}),
      ...(opts.paymentDailyLimit !== undefined ? { payment_daily_limit: opts.paymentDailyLimit } : {}),
      ...(opts.paymentTransactionLimitOption !== undefined
        ? { payment_transaction_limit_option: opts.paymentTransactionLimitOption }
        : {}),
      ...(opts.paymentTransactionLimit !== undefined
        ? { payment_transaction_limit: opts.paymentTransactionLimit }
        : {}),
      ...(opts.paymentLifespanLimit !== undefined ? { payment_lifespan_limit: opts.paymentLifespanLimit } : {}),
      ...(opts.preExpiresAt !== undefined ? { pre_expires_at: opts.preExpiresAt } : {}),
      ...(opts.activeDays !== undefined ? { active_days: opts.activeDays } : {}),
      ...(opts.categories !== undefined ? { categories: opts.categories } : {}),
      ...(opts.cardDesign !== undefined ? { card_design: opts.cardDesign } : {}),
      ...(opts.typeOfPrint !== undefined ? { type_of_print: opts.typeOfPrint } : {}),
    };

    const card = await executeWithCliSca(
      client,
      ({ scaSessionToken, idempotencyKey }) =>
        createCard(client, params, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    process.stdout.write(formatOutput(formatCard(card, opts.output), opts.output) + "\n");
  });
}

export function registerCardBulkCreateCommand(parent: Command): void {
  const bulkCreate = parent
    .command("bulk-create")
    .description("Bulk create cards from a JSON file")
    .addOption(new Option("--file <path>", "JSON file containing card definitions array").makeOptionMandatory());
  addInheritableOptions(bulkCreate);
  addWriteOptions(bulkCreate);
  bulkCreate.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { file: string }>(cmd);
    const client = await createClient(opts);

    const content = await readFile(opts.file, "utf-8");
    const cards = parseJson(content, `--file ${opts.file}`) as CreateCardParams[];

    const { bulkCreateCards } = await import("@qontoctl/core");

    const result = await executeWithCliSca(
      client,
      ({ scaSessionToken, idempotencyKey }) =>
        bulkCreateCards(client, cards, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? result
        : result.map((card) => ({
            id: card.id,
            nickname: card.nickname,
            status: card.status,
            card_level: card.card_level,
            holder_id: card.holder_id,
          }));

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
