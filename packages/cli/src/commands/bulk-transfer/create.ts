// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { Option } from "commander";
import {
  bulkVerifyPayee,
  createBulkTransfer,
  getBeneficiary,
  type BulkTransfer,
  type BulkTransferInlineBeneficiary,
  type BulkTransferItem,
  type HttpClient,
  type VopEntry,
} from "@qontoctl/core";
import { createClient } from "../../client.js";
import { formatOutput } from "../../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../../options.js";
import { parseJson } from "../../parse-json.js";
import { executeWithCliSca } from "../../sca.js";

interface BulkTransferCreateOptions extends GlobalOptions, WriteOptions {
  readonly file: string;
  readonly debitAccount: string;
  readonly vopProofToken?: string | undefined;
}

/**
 * The CLI accepts an array of these item shapes from the JSON file. They map
 * 1:1 onto {@link BulkTransferItem} after normalization (UUID generation for
 * `client_transfer_id`, amount coercion to a 2-decimal string).
 */
interface CliBulkTransferInput {
  readonly client_transfer_id?: string;
  readonly amount: string | number;
  readonly reference: string;
  readonly beneficiary_id?: string;
  readonly beneficiary?: BulkTransferInlineBeneficiary;
  readonly scheduled_date?: string;
  readonly note?: string;
  readonly attachment_ids?: readonly string[];
}

function toTableRow(bt: BulkTransfer): Record<string, string | number> {
  return {
    id: bt.id,
    total_count: bt.total_count,
    completed_count: bt.completed_count,
    pending_count: bt.pending_count,
    failed_count: bt.failed_count,
    created_at: bt.created_at,
  };
}

/**
 * Coerce a CLI-supplied amount (number or string) into the API's required
 * decimal-string format (`^\d+(\.\d{1,2})?$`). Numbers are formatted with two
 * decimal places; strings are passed through and validated server-side.
 */
function normalizeAmount(amount: string | number): string {
  if (typeof amount === "number") return amount.toFixed(2);
  return amount;
}

function normalizeItem(input: CliBulkTransferInput): BulkTransferItem {
  if (input.beneficiary_id !== undefined && input.beneficiary !== undefined) {
    throw new Error("Each transfer must specify exactly one of beneficiary_id or beneficiary, not both");
  }
  if (input.beneficiary_id === undefined && input.beneficiary === undefined) {
    throw new Error("Each transfer must specify either beneficiary_id or beneficiary");
  }
  return {
    client_transfer_id: input.client_transfer_id ?? randomUUID(),
    amount: normalizeAmount(input.amount),
    reference: input.reference,
    ...(input.beneficiary_id !== undefined ? { beneficiary_id: input.beneficiary_id } : {}),
    ...(input.beneficiary !== undefined ? { beneficiary: input.beneficiary } : {}),
    ...(input.scheduled_date !== undefined ? { scheduled_date: input.scheduled_date } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.attachment_ids !== undefined ? { attachment_ids: input.attachment_ids } : {}),
  };
}

/**
 * Resolve a single VoP entry (iban + name) for an item — either directly from
 * an inline beneficiary or by fetching the named beneficiary record.
 */
async function vopEntryForItem(httpClient: HttpClient, item: BulkTransferItem): Promise<VopEntry> {
  if (item.beneficiary !== undefined) {
    return { iban: item.beneficiary.iban, beneficiary_name: item.beneficiary.name };
  }
  if (item.beneficiary_id !== undefined) {
    const beneficiary = await getBeneficiary(httpClient, item.beneficiary_id);
    return { iban: beneficiary.iban, beneficiary_name: beneficiary.name };
  }
  // normalizeItem guards against this; defensive only.
  throw new Error("Internal: cannot resolve VoP entry — missing beneficiary information");
}

/**
 * Resolve a single batch-level `vop_proof_token` covering the exact set of
 * beneficiary IBANs in `items`. Per Qonto docs, the token is bound to the
 * exact set of IBANs in the bulk_verify_payee request, so we do this in a
 * single call and surface non-MATCH results to stderr as warnings.
 */
async function resolveBulkVopProofToken(httpClient: HttpClient, items: readonly BulkTransferItem[]): Promise<string> {
  const entries = await Promise.all(items.map((item) => vopEntryForItem(httpClient, item)));
  const result = await bulkVerifyPayee(httpClient, entries);
  for (const entry of result.requests) {
    // Contract: `bulkVerifyPayee` (core/transfers/service.ts) assigns
    // `id = String(index)` to correlate per-entry results back to the input.
    // The Qonto API may also omit `beneficiary_name`/`iban` per entry, so fall
    // back to the input entry at that index for the warning label.
    const inputIndex = Number.parseInt(entry.id, 10);
    const input = Number.isNaN(inputIndex) ? undefined : entries[inputIndex];
    const name = entry.beneficiary_name ?? input?.beneficiary_name ?? `entry ${entry.id}`;
    const iban = entry.iban ?? input?.iban ?? "unknown IBAN";
    const matchResult = entry.response?.match_result;
    if (entry.error !== undefined) {
      process.stderr.write(`Warning: VoP error for beneficiary ${name} (${iban}): ${entry.error.code}\n`);
    } else if (matchResult === "MATCH_RESULT_NO_MATCH") {
      process.stderr.write(`Warning: VoP result is "no match" for beneficiary ${name} (${iban})\n`);
    } else if (matchResult === "MATCH_RESULT_NOT_POSSIBLE") {
      process.stderr.write(`Warning: VoP result is "not possible" for beneficiary ${name} (${iban})\n`);
    } else if (matchResult === "MATCH_RESULT_CLOSE_MATCH") {
      const matched = entry.response?.matched_name ?? null;
      const matchedSuffix = matched !== null && matched !== "" ? ` (matched name: ${matched})` : "";
      process.stderr.write(`Warning: VoP result is "close match" for beneficiary ${name} (${iban})${matchedSuffix}\n`);
    }
  }
  return result.proof_token.token;
}

export function registerBulkTransferCreateCommand(parent: Command): void {
  const create = parent
    .command("create")
    .description("Create a bulk transfer from a JSON file (array of transfer items)")
    .addOption(new Option("--file <path>", "JSON file with array of transfer items").makeOptionMandatory())
    .addOption(new Option("--debit-account <id>", "bank account ID to debit").makeOptionMandatory())
    .option("--vop-proof-token <token>", "VoP proof token (auto-resolved via bulk_verify_payee if omitted)");
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_opts: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<BulkTransferCreateOptions>(cmd);
    const httpClient = await createClient(opts);

    const fileContent = await readFile(opts.file, "utf-8");
    const rawInputs = parseJson(fileContent, `--file ${opts.file}`) as readonly CliBulkTransferInput[];
    if (!Array.isArray(rawInputs) || rawInputs.length === 0) {
      throw new Error("Bulk transfer file must contain a non-empty JSON array of transfer items");
    }
    const items = rawInputs.map(normalizeItem);

    const vopProofToken = opts.vopProofToken ?? (await resolveBulkVopProofToken(httpClient, items));

    const bulkTransfer = await executeWithCliSca(
      httpClient,
      async ({ scaSessionToken, idempotencyKey }) =>
        createBulkTransfer(
          httpClient,
          {
            bank_account_id: opts.debitAccount,
            bulk_transfers: items,
            vop_proof_token: vopProofToken,
          },
          {
            idempotencyKey,
            ...(scaSessionToken !== undefined ? { scaSessionToken } : {}),
          },
        ),
      {
        verbose: opts.verbose === true || opts.debug === true,
        idempotencyKey: opts.idempotencyKey,
        scaAutoApprove: opts.scaAutoApprove,
      },
    );

    const data = opts.output === "json" || opts.output === "yaml" ? bulkTransfer : [toTableRow(bulkTransfer)];
    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });
}
