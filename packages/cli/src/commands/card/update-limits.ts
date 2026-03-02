// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { updateCardLimits, type Card, type UpdateCardLimitsParams } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface UpdateLimitsOptions extends GlobalOptions, WriteOptions {
  readonly atmMonthlyLimit?: string | undefined;
  readonly atmDailyLimitOption?: string | undefined;
  readonly atmDailyLimit?: string | undefined;
  readonly paymentMonthlyLimit?: string | undefined;
  readonly paymentDailyLimitOption?: string | undefined;
  readonly paymentDailyLimit?: string | undefined;
  readonly paymentTransactionLimitOption?: string | undefined;
  readonly paymentTransactionLimit?: string | undefined;
  readonly paymentLifespanLimit?: string | undefined;
}

function formatCard(card: Card, output: string): unknown {
  if (output === "json" || output === "yaml") return card;
  return [
    {
      id: card.id,
      nickname: card.nickname,
      atm_monthly_limit: card.atm_monthly_limit,
      atm_daily_limit: card.atm_daily_limit,
      payment_monthly_limit: card.payment_monthly_limit,
      payment_daily_limit: card.payment_daily_limit,
      payment_transaction_limit: card.payment_transaction_limit,
    },
  ];
}

export function registerCardUpdateLimitsCommand(parent: Command): void {
  const updateLimits = parent
    .command("update-limits")
    .description("Update a card's spending limits")
    .argument("<id>", "Card ID")
    .option("--atm-monthly-limit <amount>", "monthly ATM withdrawal limit (EUR)")
    .option("--atm-daily-limit-option <bool>", "enable daily ATM limit (true/false)")
    .option("--atm-daily-limit <amount>", "daily ATM withdrawal limit (EUR)")
    .option("--payment-monthly-limit <amount>", "monthly payment limit (EUR)")
    .option("--payment-daily-limit-option <bool>", "enable daily payment limit (true/false)")
    .option("--payment-daily-limit <amount>", "daily payment limit (EUR)")
    .option("--payment-transaction-limit-option <bool>", "enable per-transaction limit (true/false)")
    .option("--payment-transaction-limit <amount>", "per-transaction limit (EUR)")
    .option("--payment-lifespan-limit <amount>", "total spending cap (flash cards, EUR)");
  addInheritableOptions(updateLimits);
  addWriteOptions(updateLimits);
  updateLimits.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<UpdateLimitsOptions>(cmd);
    const client = await createClient(opts);

    const params: UpdateCardLimitsParams = {
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
    };

    const card = await executeWithCliSca(
      client,
      (scaSessionToken) =>
        updateCardLimits(client, id, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    process.stdout.write(formatOutput(formatCard(card, opts.output), opts.output) + "\n");
  });
}
