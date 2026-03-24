// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { Command } from "commander";
import { Option } from "commander";
import {
  createTransfer,
  getBeneficiary,
  verifyPayee,
  type CreateTransferParams,
  type InlineBeneficiary,
  type Transfer,
  type HttpClient,
} from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { executeWithCliSca } from "../../sca.js";

interface TransferCreateOptions extends GlobalOptions, WriteOptions {
  readonly beneficiary?: string | undefined;
  readonly debitAccount: string;
  readonly reference: string;
  readonly amount: string;
  readonly note?: string | undefined;
  readonly scheduledDate?: string | undefined;
  readonly vopProofToken?: string | undefined;
  readonly attachmentId?: readonly string[] | undefined;
  readonly beneficiaryName?: string | undefined;
  readonly beneficiaryIban?: string | undefined;
  readonly beneficiaryBic?: string | undefined;
  readonly beneficiaryEmail?: string | undefined;
  readonly beneficiaryActivityTag?: string | undefined;
}

function toTableRow(t: Transfer): Record<string, string | number | null> {
  return {
    id: t.id,
    beneficiary_id: t.beneficiary_id,
    amount: t.amount,
    amount_currency: t.amount_currency,
    status: t.status,
    scheduled_date: t.scheduled_date,
    reference: t.reference,
  };
}

async function resolveVopProofTokenByBeneficiaryId(httpClient: HttpClient, beneficiaryId: string): Promise<string> {
  const beneficiary = await getBeneficiary(httpClient, beneficiaryId);
  return resolveVopProofTokenByNameAndIban(httpClient, beneficiary.name, beneficiary.iban, beneficiaryId);
}

async function resolveVopProofTokenByNameAndIban(
  httpClient: HttpClient,
  name: string,
  iban: string,
  label?: string,
): Promise<string> {
  const vopResult = await verifyPayee(httpClient, { iban, beneficiary_name: name });
  const displayLabel = label ?? `${name} (${iban})`;

  if (vopResult.match_result === "MATCH_RESULT_NO_MATCH") {
    process.stderr.write(`Warning: VoP result is "no match" for beneficiary ${displayLabel}\n`);
  } else if (vopResult.match_result === "MATCH_RESULT_NOT_POSSIBLE") {
    process.stderr.write(`Warning: VoP result is "not possible" for beneficiary ${displayLabel}\n`);
  } else if (vopResult.match_result === "MATCH_RESULT_CLOSE_MATCH") {
    process.stderr.write(`Warning: VoP result is "close match" for beneficiary ${displayLabel}\n`);
  }

  return vopResult.proof_token.token;
}

export function registerTransferCreateCommand(parent: Command): void {
  const create = parent
    .command("create")
    .description("Create a SEPA transfer")
    .addOption(new Option("--beneficiary <id>", "existing beneficiary ID (mutually exclusive with --beneficiary-name)"))
    .addOption(new Option("--beneficiary-name <name>", "inline beneficiary name (requires --beneficiary-iban)"))
    .addOption(new Option("--beneficiary-iban <iban>", "inline beneficiary IBAN (requires --beneficiary-name)"))
    .option("--beneficiary-bic <bic>", "inline beneficiary BIC")
    .option("--beneficiary-email <email>", "inline beneficiary email")
    .option("--beneficiary-activity-tag <tag>", "inline beneficiary activity tag")
    .addOption(new Option("--debit-account <id>", "bank account ID to debit").makeOptionMandatory())
    .addOption(new Option("--reference <text>", "transfer reference").makeOptionMandatory())
    .addOption(new Option("--amount <number>", "amount to transfer").makeOptionMandatory())
    .option("--note <text>", "optional note")
    .option("--scheduled-date <date>", "scheduled date (YYYY-MM-DD)")
    .option("--vop-proof-token <token>", "VoP proof token (auto-resolved if omitted)")
    .option("--attachment-id <id...>", "attachment IDs (max 5, required for transfers > 30k EUR)");
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<TransferCreateOptions>(cmd);
    const httpClient = await createClient(opts);

    let vopProofToken: string;
    let beneficiaryField: { beneficiary_id: string } | { beneficiary: InlineBeneficiary };

    if (opts.beneficiaryName !== undefined && opts.beneficiaryIban !== undefined) {
      if (opts.beneficiary !== undefined) {
        throw new Error(
          "Cannot specify both --beneficiary and inline beneficiary options (--beneficiary-name/--beneficiary-iban)",
        );
      }
      const inlineBeneficiary: InlineBeneficiary = {
        name: opts.beneficiaryName,
        iban: opts.beneficiaryIban,
        ...(opts.beneficiaryBic !== undefined ? { bic: opts.beneficiaryBic } : {}),
        ...(opts.beneficiaryEmail !== undefined ? { email: opts.beneficiaryEmail } : {}),
        ...(opts.beneficiaryActivityTag !== undefined ? { activity_tag: opts.beneficiaryActivityTag } : {}),
      };
      vopProofToken =
        opts.vopProofToken ??
        (await resolveVopProofTokenByNameAndIban(httpClient, inlineBeneficiary.name, inlineBeneficiary.iban));
      beneficiaryField = { beneficiary: inlineBeneficiary };
    } else if (opts.beneficiary !== undefined) {
      vopProofToken = opts.vopProofToken ?? (await resolveVopProofTokenByBeneficiaryId(httpClient, opts.beneficiary));
      beneficiaryField = { beneficiary_id: opts.beneficiary };
    } else {
      throw new Error("Either --beneficiary or --beneficiary-name and --beneficiary-iban must be provided");
    }

    const params: CreateTransferParams = {
      ...beneficiaryField,
      bank_account_id: opts.debitAccount,
      reference: opts.reference,
      amount: opts.amount,
      vop_proof_token: vopProofToken,
      ...(opts.note !== undefined ? { note: opts.note } : {}),
      ...(opts.scheduledDate !== undefined ? { scheduled_date: opts.scheduledDate } : {}),
      ...(opts.attachmentId !== undefined ? { attachment_ids: opts.attachmentId } : {}),
    };

    const transfer = await executeWithCliSca(
      httpClient,
      async (scaSessionToken) =>
        createTransfer(httpClient, params, {
          ...(opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
        }),
      { verbose: opts.verbose === true || opts.debug === true },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? transfer : [toTableRow(transfer)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
