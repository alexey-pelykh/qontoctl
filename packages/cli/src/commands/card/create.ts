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
import { executeWithCliSca } from "../../sca.js";

interface CardCreateOptions extends GlobalOptions, WriteOptions {
  readonly holderId: string;
  readonly initiatorId: string;
  readonly organizationId: string;
  readonly bankAccountId: string;
  readonly cardLevel: string;
  readonly shipToBusiness?: true | undefined;
  readonly atmOption?: string | undefined;
  readonly nfcOption?: string | undefined;
  readonly foreignOption?: string | undefined;
  readonly onlineOption?: string | undefined;
  readonly atmMonthlyLimit?: string | undefined;
  readonly atmDailyLimitOption?: string | undefined;
  readonly atmDailyLimit?: string | undefined;
  readonly paymentMonthlyLimit?: string | undefined;
  readonly paymentDailyLimitOption?: string | undefined;
  readonly paymentDailyLimit?: string | undefined;
  readonly paymentTransactionLimitOption?: string | undefined;
  readonly paymentTransactionLimit?: string | undefined;
  readonly paymentLifespanLimit?: string | undefined;
  readonly preExpiresAt?: string | undefined;
  readonly activeDays?: string[] | undefined;
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
    .option("--atm-option <bool>", "enable ATM withdrawals (true/false)")
    .option("--nfc-option <bool>", "enable contactless payments (true/false)")
    .option("--foreign-option <bool>", "enable international payments (true/false)")
    .option("--online-option <bool>", "enable online payments (true/false)")
    .option("--atm-monthly-limit <amount>", "monthly ATM withdrawal limit (EUR)")
    .option("--atm-daily-limit-option <bool>", "enable daily ATM limit (true/false)")
    .option("--atm-daily-limit <amount>", "daily ATM withdrawal limit (EUR)")
    .option("--payment-monthly-limit <amount>", "monthly payment limit (EUR)")
    .option("--payment-daily-limit-option <bool>", "enable daily payment limit (true/false)")
    .option("--payment-daily-limit <amount>", "daily payment limit (EUR)")
    .option("--payment-transaction-limit-option <bool>", "enable per-transaction limit (true/false)")
    .option("--payment-transaction-limit <amount>", "per-transaction limit (EUR)")
    .option("--payment-lifespan-limit <amount>", "total spending cap (flash cards, EUR)")
    .option("--pre-expires-at <datetime>", "flash card validity end (ISO 8601)")
    .option("--active-days <days...>", "active weekdays (1=Monday, 7=Sunday)")
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
      ...(opts.atmOption !== undefined ? { atm_option: opts.atmOption === "true" } : {}),
      ...(opts.nfcOption !== undefined ? { nfc_option: opts.nfcOption === "true" } : {}),
      ...(opts.foreignOption !== undefined ? { foreign_option: opts.foreignOption === "true" } : {}),
      ...(opts.onlineOption !== undefined ? { online_option: opts.onlineOption === "true" } : {}),
      ...(opts.atmMonthlyLimit !== undefined ? { atm_monthly_limit: Number(opts.atmMonthlyLimit) } : {}),
      ...(opts.atmDailyLimitOption !== undefined
        ? { atm_daily_limit_option: opts.atmDailyLimitOption === "true" }
        : {}),
      ...(opts.atmDailyLimit !== undefined ? { atm_daily_limit: Number(opts.atmDailyLimit) } : {}),
      ...(opts.paymentMonthlyLimit !== undefined ? { payment_monthly_limit: Number(opts.paymentMonthlyLimit) } : {}),
      ...(opts.paymentDailyLimitOption !== undefined
        ? { payment_daily_limit_option: opts.paymentDailyLimitOption === "true" }
        : {}),
      ...(opts.paymentDailyLimit !== undefined ? { payment_daily_limit: Number(opts.paymentDailyLimit) } : {}),
      ...(opts.paymentTransactionLimitOption !== undefined
        ? { payment_transaction_limit_option: opts.paymentTransactionLimitOption === "true" }
        : {}),
      ...(opts.paymentTransactionLimit !== undefined
        ? { payment_transaction_limit: Number(opts.paymentTransactionLimit) }
        : {}),
      ...(opts.paymentLifespanLimit !== undefined ? { payment_lifespan_limit: Number(opts.paymentLifespanLimit) } : {}),
      ...(opts.preExpiresAt !== undefined ? { pre_expires_at: opts.preExpiresAt } : {}),
      ...(opts.activeDays !== undefined ? { active_days: opts.activeDays.map(Number) } : {}),
      ...(opts.categories !== undefined ? { categories: opts.categories } : {}),
      ...(opts.cardDesign !== undefined ? { card_design: opts.cardDesign } : {}),
      ...(opts.typeOfPrint !== undefined ? { type_of_print: opts.typeOfPrint } : {}),
    };

    const card = await executeWithCliSca(
      client,
      (scaSessionToken) =>
        createCard(client, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
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
    const cards = JSON.parse(content) as CreateCardParams[];

    const { bulkCreateCards } = await import("@qontoctl/core");

    const result = await executeWithCliSca(
      client,
      (scaSessionToken) =>
        bulkCreateCards(client, cards, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
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
