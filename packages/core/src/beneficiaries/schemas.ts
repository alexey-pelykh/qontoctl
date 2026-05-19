// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { Beneficiary } from "../types/beneficiary.js";

// https://docs.qonto.com/api-reference/business-api/payments-transfers/sepa-transfers/beneficiaries/sepa-beneficiaries/show
// https://docs.qonto.com/api-reference/business-api/payments-transfers/sepa-transfers/beneficiaries/sepa-beneficiaries/index
//
// Production returns `iban`/`bic`/`currency` as flat top-level fields per the
// official SepaBeneficiary schema. The Qonto sandbox additionally wraps them
// under `bank_account: { iban, bic, currency }`. The preprocess hoists those
// nested values to the top level when the flat fields are absent, so a
// single Beneficiary type serves both environments and existing CLI/MCP
// code (which reads `.iban`/`.bic`/`.currency`) keeps working unchanged.
const BeneficiaryObjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    iban: z.string(),
    // BIC is nullable: the Qonto API derives BIC from IBAN where possible
    // (e.g., French SEPA IBANs), but returns `null` when derivation fails
    // (typical for foreign-bank or partial-data beneficiaries).
    bic: z.nullable(z.string()).optional().default(null),
    email: z.nullable(z.string()).optional().default(null),
    activity_tag: z.nullable(z.string()).optional().default(null),
    status: z.enum(["pending", "validated", "declined"]),
    trusted: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
    // Currency is the ISO 4217 code of the beneficiary's bank account.
    // The probe (#621) flagged this as undeclared API drift; surfaced flat
    // here from the same `bank_account.currency` the preprocess inspects
    // for iban/bic. Permissive declaration (`.nullable().optional()`)
    // tolerates legacy beneficiaries where the field is absent or null.
    currency: z.string().nullable().optional(),
  })
  .strip();

export const BeneficiarySchema: z.ZodType<Beneficiary> = z.preprocess((input) => {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  const obj = input as Record<string, unknown>;
  const bankAccount = obj["bank_account"];
  if (bankAccount === null || typeof bankAccount !== "object" || Array.isArray(bankAccount)) {
    return input;
  }
  const ba = bankAccount as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  if (!("iban" in out) && typeof ba["iban"] === "string") {
    out["iban"] = ba["iban"];
  }
  if (!("bic" in out) && (typeof ba["bic"] === "string" || ba["bic"] === null)) {
    out["bic"] = ba["bic"];
  }
  if (!("currency" in out) && (typeof ba["currency"] === "string" || ba["currency"] === null)) {
    out["currency"] = ba["currency"];
  }
  return out;
}, BeneficiaryObjectSchema);

export const BeneficiaryResponseSchema = z
  .object({
    beneficiary: BeneficiarySchema,
  })
  .strip();

export const BeneficiaryListResponseSchema = z
  .object({
    beneficiaries: z.array(BeneficiarySchema),
    meta: PaginationMetaSchema,
  })
  .strip();
