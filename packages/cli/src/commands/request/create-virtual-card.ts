// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { createVirtualCardRequest, type CreateVirtualCardRequestParams, type RequestVirtualCard } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface CreateVirtualCardOptions extends GlobalOptions, WriteOptions {
  readonly note?: string | undefined;
  readonly paymentMonthlyLimit?: string | undefined;
  readonly cardLevel?: string | undefined;
  readonly cardDesign?: string | undefined;
}

function toTableRow(r: RequestVirtualCard): Record<string, string | null> {
  return {
    id: r.id,
    status: r.status,
    payment_monthly_limit: `${r.payment_monthly_limit} ${r.currency}`,
    card_level: r.card_level,
    card_design: r.card_design,
    created_at: r.created_at,
  };
}

export function registerRequestCreateVirtualCardCommand(parent: Command): void {
  const cmd = parent
    .command("create-virtual-card")
    .description("Create a virtual card request")
    .option("--note <text>", "description to help the approver (max 125 chars)")
    .option("--payment-monthly-limit <amount>", "monthly spending limit (e.g. 5.00)")
    .option("--card-level <level>", "card level (virtual or virtual_partner)", "virtual")
    .option("--card-design <design>", "card design identifier");
  addInheritableOptions(cmd);
  addWriteOptions(cmd);
  cmd.action(async (_opts: unknown, command: Command) => {
    const opts = resolveGlobalOptions<CreateVirtualCardOptions>(command);
    const httpClient = await createClient(opts);

    const params: CreateVirtualCardRequestParams = {
      ...(opts.note !== undefined ? { note: opts.note } : {}),
      ...(opts.paymentMonthlyLimit !== undefined ? { payment_monthly_limit: opts.paymentMonthlyLimit } : {}),
      ...(opts.cardLevel !== undefined ? { card_level: opts.cardLevel } : {}),
      ...(opts.cardDesign !== undefined ? { card_design: opts.cardDesign } : {}),
    };

    const request = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        createVirtualCardRequest(httpClient, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? request : [toTableRow(request)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
