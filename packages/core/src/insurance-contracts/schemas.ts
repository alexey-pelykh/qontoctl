// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";
import type { InsuranceContract, InsuranceDocument } from "./types.js";

export const InsuranceContractOriginSchema = z.enum(["insurance_hub", "qonto_other", "stello"]);

export const InsuranceContractStatusSchema = z.enum([
  "active",
  "pending_payment",
  "pending_others",
  "action_required",
  "expired",
  "archived",
]);

export const InsuranceContractPaymentFrequencySchema = z.enum(["month", "quarter", "semester", "annual"]);

export const InsuranceContractPriceSchema = z
  .object({
    value: z.string(),
    currency: z.string(),
  })
  .strip();

export const InsuranceContractDocumentRefSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
  })
  .strip();

// The Qonto upload-attachment endpoint (`POST /v2/insurance_contracts/{id}/attachments`)
// returns a flat `{ id, name, type }` payload — NOT the file_name/file_size/
// file_content_type/url/created_at shape an earlier draft inferred. Empirically
// confirmed against the live sandbox during #454. The same shape echoes back
// in `InsuranceContract.documents[]`, so this and `InsuranceContractDocumentRef`
// describe the same record under two endpoints.
export const InsuranceDocumentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
  })
  .strip() satisfies z.ZodType<InsuranceDocument>;

// The Qonto API returns `null` (not `undefined` / omitted) for date and URL
// fields that are not set on a contract — so these are modeled as
// `nullish()` (optional + nullable). Empirically observed against the
// sandbox `/v2/insurance_contracts` create response (issue #509).
export const InsuranceContractSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    contract_id: z.string(),
    origin: InsuranceContractOriginSchema,
    provider_slug: z.string(),
    type: z.string(),
    status: InsuranceContractStatusSchema,
    payment_frequency: InsuranceContractPaymentFrequencySchema,
    price: InsuranceContractPriceSchema,
    start_date: z.string().nullish(),
    expiration_date: z.string().nullish(),
    renewal_date: z.string().nullish(),
    service_url: z.string().nullish(),
    troubleshooting_url: z.string().nullish(),
    documents: z.array(InsuranceContractDocumentRefSchema).nullish(),
  })
  .strip() satisfies z.ZodType<InsuranceContract>;

export const InsuranceContractResponseSchema = z
  .object({
    insurance_contract: InsuranceContractSchema,
  })
  .strip();
