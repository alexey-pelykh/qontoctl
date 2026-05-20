// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { Client, ClientAddress } from "./client.js";

export const ClientAddressSchema = z
  .object({
    street_address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    zip_code: z.string().nullable().optional(),
    province_code: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
  })
  .strip() satisfies z.ZodType<ClientAddress>;

export const ClientSchema = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    // Individual clients (kind: "individual") may omit `name` entirely; Qonto returns
    // `first_name` / `last_name` instead. See #496.
    name: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    kind: z.enum(["company", "individual", "freelancer"]),
    email: z.string().nullable().optional(),
    vat_number: z.string().nullable().optional(),
    tax_identification_number: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    zip_code: z.string().nullable().optional(),
    province_code: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
    billing_address: ClientAddressSchema.nullable().optional(),
    delivery_address: ClientAddressSchema.nullable().optional(),
    locale: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    // Post-#619/#624/#625/#626 contract-probe run additions (sandbox
    // 2026-05-20). `extra_emails` items are kept as `z.unknown()` because
    // observed shape is undocumented (could be strings or labelled objects);
    // the parser-permissive declaration accepts either.
    extra_emails: z.array(z.unknown()).nullable().optional(),
    e_invoicing_reachable: z.boolean().nullable().optional(),
  })
  .strip() satisfies z.ZodType<Client>;

export const ClientResponseSchema = z
  .object({
    client: ClientSchema,
  })
  .strip();

export const ClientListResponseSchema = z
  .object({
    clients: z.array(ClientSchema),
    meta: PaginationMetaSchema,
  })
  .strip();
