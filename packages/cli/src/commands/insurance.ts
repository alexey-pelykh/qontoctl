// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Command, Option } from "commander";
import type {
  InsuranceContract,
  InsuranceContractOrigin,
  InsuranceContractPaymentFrequency,
  InsuranceContractStatus,
} from "@qontoctl/core";
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

const ORIGIN_CHOICES = ["insurance_hub", "qonto_other", "stello"] as const;
const STATUS_CHOICES = [
  "active",
  "pending_payment",
  "pending_others",
  "action_required",
  "expired",
  "archived",
] as const;
const PAYMENT_FREQUENCY_CHOICES = ["month", "quarter", "semester", "annual"] as const;

interface InsuranceCreateOptions extends GlobalOptions, WriteOptions {
  readonly name: string;
  readonly contractId: string;
  readonly origin: InsuranceContractOrigin;
  readonly providerSlug: string;
  readonly type: string;
  readonly status: InsuranceContractStatus;
  readonly paymentFrequency: InsuranceContractPaymentFrequency;
  readonly priceValue: string;
  readonly priceCurrency: string;
  readonly startDate?: string | undefined;
  readonly expirationDate?: string | undefined;
  readonly renewalDate?: string | undefined;
  readonly serviceUrl?: string | undefined;
  readonly troubleshootingUrl?: string | undefined;
}

interface InsuranceUpdateOptions extends GlobalOptions, WriteOptions {
  readonly name?: string | undefined;
  readonly contractId?: string | undefined;
  readonly origin?: InsuranceContractOrigin | undefined;
  readonly providerSlug?: string | undefined;
  readonly type?: string | undefined;
  readonly status?: InsuranceContractStatus | undefined;
  readonly paymentFrequency?: InsuranceContractPaymentFrequency | undefined;
  readonly priceValue?: string | undefined;
  readonly priceCurrency?: string | undefined;
  readonly startDate?: string | undefined;
  readonly expirationDate?: string | undefined;
  readonly renewalDate?: string | undefined;
  readonly serviceUrl?: string | undefined;
  readonly troubleshootingUrl?: string | undefined;
}

function contractToTableRow(c: InsuranceContract): Record<string, string> {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    status: c.status,
    provider_slug: c.provider_slug,
    contract_id: c.contract_id,
    origin: c.origin,
    payment_frequency: c.payment_frequency,
    price: `${c.price.value} ${c.price.currency}`,
    start_date: c.start_date ?? "",
    expiration_date: c.expiration_date ?? "",
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
    .addOption(new Option("--name <name>", "contract display name").makeOptionMandatory())
    .addOption(new Option("--contract-id <id>", "partner-generated contract identifier").makeOptionMandatory())
    .addOption(
      new Option("--origin <origin>", "contract origin")
        .choices([...ORIGIN_CHOICES])
        .makeOptionMandatory(),
    )
    .addOption(new Option("--provider-slug <slug>", "insurance provider identifier (e.g. axa)").makeOptionMandatory())
    .addOption(new Option("--type <type>", "insurance category (e.g. business_liability)").makeOptionMandatory())
    .addOption(
      new Option("--status <status>", "contract status")
        .choices([...STATUS_CHOICES])
        .makeOptionMandatory(),
    )
    .addOption(
      new Option("--payment-frequency <frequency>", "payment frequency")
        .choices([...PAYMENT_FREQUENCY_CHOICES])
        .makeOptionMandatory(),
    )
    .addOption(new Option("--price-value <amount>", "price amount as a decimal string (e.g. 99.99)").makeOptionMandatory())
    .addOption(new Option("--price-currency <code>", "price currency code (ISO 4217, e.g. EUR)").makeOptionMandatory())
    .option("--start-date <date>", "coverage start date (YYYY-MM-DD)")
    .option("--expiration-date <date>", "contract expiration date (YYYY-MM-DD)")
    .option("--renewal-date <date>", "policy renewal date (YYYY-MM-DD)")
    .option("--service-url <url>", "customer portal access URL")
    .option("--troubleshooting-url <url>", "support / troubleshooting URL");
  addInheritableOptions(create);
  addWriteOptions(create);
  create.action(async (_options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<InsuranceCreateOptions>(cmd);
    const client = await createClient(opts);

    const contract = await createInsuranceContract(
      client,
      {
        name: opts.name,
        contract_id: opts.contractId,
        origin: opts.origin,
        provider_slug: opts.providerSlug,
        type: opts.type,
        status: opts.status,
        payment_frequency: opts.paymentFrequency,
        price: { value: opts.priceValue, currency: opts.priceCurrency },
        ...(opts.startDate !== undefined ? { start_date: opts.startDate } : {}),
        ...(opts.expirationDate !== undefined ? { expiration_date: opts.expirationDate } : {}),
        ...(opts.renewalDate !== undefined ? { renewal_date: opts.renewalDate } : {}),
        ...(opts.serviceUrl !== undefined ? { service_url: opts.serviceUrl } : {}),
        ...(opts.troubleshootingUrl !== undefined ? { troubleshooting_url: opts.troubleshootingUrl } : {}),
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
    .option("--name <name>", "contract display name")
    .option("--contract-id <id>", "partner-generated contract identifier")
    .addOption(new Option("--origin <origin>", "contract origin").choices([...ORIGIN_CHOICES]))
    .option("--provider-slug <slug>", "insurance provider identifier")
    .option("--type <type>", "insurance category")
    .addOption(new Option("--status <status>", "contract status").choices([...STATUS_CHOICES]))
    .addOption(new Option("--payment-frequency <frequency>", "payment frequency").choices([...PAYMENT_FREQUENCY_CHOICES]))
    .option("--price-value <amount>", "price amount as a decimal string")
    .option("--price-currency <code>", "price currency code (ISO 4217)")
    .option("--start-date <date>", "coverage start date (YYYY-MM-DD)")
    .option("--expiration-date <date>", "contract expiration date (YYYY-MM-DD)")
    .option("--renewal-date <date>", "policy renewal date (YYYY-MM-DD)")
    .option("--service-url <url>", "customer portal access URL")
    .option("--troubleshooting-url <url>", "support / troubleshooting URL");
  addInheritableOptions(update);
  addWriteOptions(update);
  update.action(async (id: string, _options: unknown, cmd: Command) => {
    const opts = resolveGlobalOptions<InsuranceUpdateOptions>(cmd);
    const client = await createClient(opts);

    if ((opts.priceValue === undefined) !== (opts.priceCurrency === undefined)) {
      throw new Error("--price-value and --price-currency must be provided together.");
    }

    const contract = await updateInsuranceContract(
      client,
      id,
      {
        ...(opts.name !== undefined ? { name: opts.name } : {}),
        ...(opts.contractId !== undefined ? { contract_id: opts.contractId } : {}),
        ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
        ...(opts.providerSlug !== undefined ? { provider_slug: opts.providerSlug } : {}),
        ...(opts.type !== undefined ? { type: opts.type } : {}),
        ...(opts.status !== undefined ? { status: opts.status } : {}),
        ...(opts.paymentFrequency !== undefined ? { payment_frequency: opts.paymentFrequency } : {}),
        ...(opts.priceValue !== undefined && opts.priceCurrency !== undefined
          ? { price: { value: opts.priceValue, currency: opts.priceCurrency } }
          : {}),
        ...(opts.startDate !== undefined ? { start_date: opts.startDate } : {}),
        ...(opts.expirationDate !== undefined ? { expiration_date: opts.expirationDate } : {}),
        ...(opts.renewalDate !== undefined ? { renewal_date: opts.renewalDate } : {}),
        ...(opts.serviceUrl !== undefined ? { service_url: opts.serviceUrl } : {}),
        ...(opts.troubleshootingUrl !== undefined ? { troubleshooting_url: opts.troubleshootingUrl } : {}),
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
