// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Command, Option } from "commander";
import type { InsuranceContract } from "@qontoctl/core";
import {
  getInsuranceContract,
  createInsuranceContract,
  updateInsuranceContract,
  uploadInsuranceDocument,
  removeInsuranceDocument,
} from "@qontoctl/core";
import { createClient } from "../client.js";
import { formatOutput } from "../formatters/index.js";
import { addInheritableOptions, addWriteOptions, resolveGlobalOptions } from "../inherited-options.js";
import type { GlobalOptions, WriteOptions } from "../options.js";

interface InsuranceCreateOptions extends GlobalOptions, WriteOptions {
  readonly insuranceType: string;
  readonly providerName: string;
  readonly contractNumber?: string | undefined;
  readonly startDate: string;
  readonly endDate?: string | undefined;
}

interface InsuranceUpdateOptions extends GlobalOptions, WriteOptions {
  readonly insuranceType?: string | undefined;
  readonly providerName?: string | undefined;
  readonly contractNumber?: string | undefined;
  readonly startDate?: string | undefined;
  readonly endDate?: string | undefined;
}

function contractToTableRow(c: InsuranceContract): Record<string, string> {
  return {
    id: c.id,
    insurance_type: c.insurance_type,
    status: c.status,
    provider_name: c.provider_name,
    contract_number: c.contract_number ?? "",
    start_date: c.start_date,
    end_date: c.end_date ?? "",
  };
}

export function registerInsuranceCommands(program: Command): void {
  const insurance = program.command("insurance").description("Manage insurance contracts");

  // --- show ---
  const show = insurance.command("show <id>").description("Show insurance contract details");
  addInheritableOptions(show);
  show.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions>(cmd);
    const client = await createClient(opts);

    const contract = await getInsuranceContract(client, id);

    const data = opts.output === "json" || opts.output === "yaml" ? contract : [contractToTableRow(contract)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- create ---
  const create = insurance
    .command("create")
    .description("Create a new insurance contract")
    .addOption(new Option("--insurance-type <type>", "insurance type").makeOptionMandatory())
    .addOption(new Option("--provider-name <name>", "insurance provider name").makeOptionMandatory())
    .option("--contract-number <number>", "contract number")
    .addOption(new Option("--start-date <date>", "contract start date (YYYY-MM-DD)").makeOptionMandatory())
    .option("--end-date <date>", "contract end date (YYYY-MM-DD)");
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<InsuranceCreateOptions>(cmd);
    const client = await createClient(opts);

    const contract = await createInsuranceContract(
      client,
      {
        insurance_type: opts.insuranceType,
        provider_name: opts.providerName,
        start_date: opts.startDate,
        contract_number: opts.contractNumber,
        end_date: opts.endDate,
      },
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? contract : [contractToTableRow(contract)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- update ---
  const update = insurance
    .command("update <id>")
    .description("Update an insurance contract")
    .option("--insurance-type <type>", "insurance type")
    .option("--provider-name <name>", "insurance provider name")
    .option("--contract-number <number>", "contract number")
    .option("--start-date <date>", "contract start date (YYYY-MM-DD)")
    .option("--end-date <date>", "contract end date (YYYY-MM-DD)");
  addInheritableOptions(update);
  addWriteOptions(update);
  update.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<InsuranceUpdateOptions>(cmd);
    const client = await createClient(opts);

    const contract = await updateInsuranceContract(
      client,
      id,
      {
        insurance_type: opts.insuranceType,
        provider_name: opts.providerName,
        contract_number: opts.contractNumber,
        start_date: opts.startDate,
        end_date: opts.endDate,
      },
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data = opts.output === "json" || opts.output === "yaml" ? contract : [contractToTableRow(contract)];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- upload-doc ---
  const uploadDoc = insurance
    .command("upload-doc <id> <file>")
    .description("Upload a document to an insurance contract");
  addInheritableOptions(uploadDoc);
  addWriteOptions(uploadDoc);
  uploadDoc.action(async (id: string, file: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions>(cmd);
    const client = await createClient(opts);

    const buffer = await readFile(file);
    const fileName = basename(file);

    const doc = await uploadInsuranceDocument(
      client,
      id,
      new Blob([buffer]),
      fileName,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    const data =
      opts.output === "json" || opts.output === "yaml"
        ? doc
        : [
            {
              id: doc.id,
              file_name: doc.file_name,
              file_size: doc.file_size,
              file_content_type: doc.file_content_type,
              created_at: doc.created_at,
            },
          ];

    process.stdout.write(formatOutput(data, opts.output) + "\n");
  });

  // --- remove-doc ---
  const removeDoc = insurance
    .command("remove-doc <id> <doc-id>")
    .description("Remove a document from an insurance contract")
    .addOption(new Option("--yes", "skip confirmation prompt"));
  addInheritableOptions(removeDoc);
  addWriteOptions(removeDoc);
  removeDoc.action(async (id: string, docId: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<GlobalOptions & WriteOptions & { yes?: true | undefined }>(cmd);
    const client = await createClient(opts);

    if (opts.yes !== true) {
      process.stderr.write(`About to remove document ${docId} from insurance contract ${id}. Use --yes to confirm.\n`);
      process.exitCode = 1;
      return;
    }

    await removeInsuranceDocument(
      client,
      id,
      docId,
      opts.idempotencyKey !== undefined ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    if (opts.output === "json" || opts.output === "yaml") {
      process.stdout.write(formatOutput({ deleted: true, id: docId }, opts.output) + "\n");
    } else {
      process.stdout.write(`Document ${docId} removed from insurance contract ${id}.\n`);
    }
  });
}
