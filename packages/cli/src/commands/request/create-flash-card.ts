// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { createFlashCardRequest, type CreateFlashCardRequestParams, type RequestFlashCard } from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface CreateFlashCardOptions extends GlobalOptions, WriteOptions {
  readonly note?: string | undefined;
  readonly paymentLifespanLimit?: string | undefined;
  readonly preExpiresAt?: string | undefined;
}

function toTableRow(r: RequestFlashCard): Record<string, string | null> {
  return {
    id: r.id,
    status: r.status,
    payment_lifespan_limit: `${r.payment_lifespan_limit} ${r.currency}`,
    pre_expires_at: r.pre_expires_at,
    created_at: r.created_at,
  };
}

export function registerRequestCreateFlashCardCommand(parent: Command): void {
  const cmd = parent
    .command("create-flash-card")
    .description("Create a flash card request")
    .option("--note <text>", "description to help the approver")
    .option("--payment-lifespan-limit <amount>", "spending limit (e.g. 250.00)")
    .option("--pre-expires-at <datetime>", "card expiration (ISO 8601, max 1 year)");
  addInheritableOptions(cmd);
  addWriteOptions(cmd);
  cmd.action(async (_opts: unknown, command: Command) => {
    const opts = resolveGlobalOptions<CreateFlashCardOptions>(command);
    const httpClient = await createClient(opts);

    const params: CreateFlashCardRequestParams = {
      ...(opts.note !== undefined ? { note: opts.note } : {}),
      ...(opts.paymentLifespanLimit !== undefined ? { payment_lifespan_limit: opts.paymentLifespanLimit } : {}),
      ...(opts.preExpiresAt !== undefined ? { pre_expires_at: opts.preExpiresAt } : {}),
    };

    const request = await executeWithCliSca(
      httpClient,
      async ({ scaSessionToken, idempotencyKey }) =>
        createFlashCardRequest(httpClient, params, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? request : [toTableRow(request)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
