// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import {
  createRecurringTransfer,
  getBeneficiary,
  verifyPayee,
  type CreateRecurringTransferParams,
  type HttpClient,
  type RecurringTransfer,
} from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface RecurringTransferCreateOptions extends GlobalOptions, WriteOptions {
  readonly beneficiary: string;
  readonly debitAccount: string;
  readonly amount: string;
  readonly currency: string;
  readonly reference: string;
  readonly note?: string | undefined;
  readonly startDate: string;
  readonly schedule: string;
  readonly vopProofToken?: string | undefined;
}

/**
 * Resolve a single VoP proof token for a beneficiary by looking up its
 * IBAN/name and calling `verify_payee`. Mirrors the helper in
 * `packages/cli/src/commands/transfer/create.ts` — kept colocated here per
 * project convention (no shared helper between single and recurring transfers).
 */
async function resolveVopProofTokenByBeneficiaryId(httpClient: HttpClient, beneficiaryId: string): Promise<string> {
  const beneficiary = await getBeneficiary(httpClient, beneficiaryId);
  const vopResult = await verifyPayee(httpClient, {
    iban: beneficiary.iban,
    beneficiary_name: beneficiary.name,
  });
  if (vopResult.match_result === "MATCH_RESULT_NO_MATCH") {
    process.stderr.write(`Warning: VoP result is "no match" for beneficiary ${beneficiaryId}\n`);
  } else if (vopResult.match_result === "MATCH_RESULT_NOT_POSSIBLE") {
    process.stderr.write(`Warning: VoP result is "not possible" for beneficiary ${beneficiaryId}\n`);
  } else if (vopResult.match_result === "MATCH_RESULT_CLOSE_MATCH") {
    const nameInfo = vopResult.matched_name !== null ? ` (matched name: ${vopResult.matched_name})` : "";
    process.stderr.write(`Warning: VoP result is "close match" for beneficiary ${beneficiaryId}${nameInfo}\n`);
  }
  return vopResult.proof_token.token;
}

function toTableRow(rt: RecurringTransfer): Record<string, string | number | null> {
  return {
    id: rt.id,
    beneficiary_id: rt.beneficiary_id,
    amount: rt.amount,
    amount_currency: rt.amount_currency,
    frequency: rt.frequency,
    first_execution_date: rt.first_execution_date,
    next_execution_date: rt.next_execution_date,
    status: rt.status ?? null,
  };
}

export function registerRecurringTransferCreateCommand(parent: Command): void {
  const create = parent
    .command("create")
    .description("Create a recurring transfer")
    .addOption(new Option("--beneficiary <id>", "beneficiary ID").makeOptionMandatory())
    .addOption(new Option("--debit-account <id>", "bank account ID to debit").makeOptionMandatory())
    .addOption(new Option("--amount <number>", "amount to transfer").makeOptionMandatory())
    .addOption(new Option("--currency <code>", "currency code").default("EUR"))
    .addOption(new Option("--reference <text>", "transfer reference").makeOptionMandatory())
    .option("--note <text>", "optional note")
    .addOption(new Option("--start-date <date>", "first execution date (YYYY-MM-DD)").makeOptionMandatory())
    .addOption(
      new Option("--schedule <frequency>", "transfer frequency")
        .choices(["weekly", "monthly", "quarterly", "half_yearly", "yearly"])
        .makeOptionMandatory(),
    )
    .option("--vop-proof-token <token>", "VoP proof token (auto-resolved if omitted)");
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<RecurringTransferCreateOptions>(cmd);
    const httpClient = await createClient(opts);

    // Mirrors the single-transfer CLI WI-K block: the auto-resolved
    // `vopProofToken` is captured in this closure variable BEFORE the SCA
    // challenge in `executeWithCliSca` and reused verbatim on the post-SCA
    // retry, so PSD2 RTS Art. 5 dynamic linking holds and `verifyPayee` is
    // never re-run mid-flow. The MCP analogue handles a caller-driven
    // two-step retry where auto-resolution must be skipped to preserve the
    // binding — see the WI-K block in `packages/mcp/src/tools/recurring-transfer.ts`.
    const vopProofToken =
      opts.vopProofToken ?? (await resolveVopProofTokenByBeneficiaryId(httpClient, opts.beneficiary));

    const params: CreateRecurringTransferParams = {
      beneficiary_id: opts.beneficiary,
      bank_account_id: opts.debitAccount,
      amount: opts.amount,
      currency: opts.currency,
      reference: opts.reference,
      first_execution_date: opts.startDate,
      frequency: opts.schedule as CreateRecurringTransferParams["frequency"],
      vop_proof_token: vopProofToken,
      ...(opts.note !== undefined ? { note: opts.note } : {}),
    };

    const recurringTransfer = await executeWithCliSca(
      httpClient,
      async ({ scaSessionToken, idempotencyKey }) =>
        createRecurringTransfer(httpClient, params, {
          idempotencyKey,
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true, idempotencyKey: opts.idempotencyKey },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? recurringTransfer : [toTableRow(recurringTransfer)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
