// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type { Client, ClientAddress } from "./client.js";

export const ClientAddressSchema = z
  .object({
    street_address: z.string().nullable(),
    city: z.string().nullable(),
    zip_code: z.string().nullable(),
    province_code: z.string().nullable(),
    country_code: z.string().nullable(),
  })
  .strip() satisfies z.ZodType<ClientAddress>;

export const ClientSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    kind: z.enum(["company", "individual", "freelancer"]),
    email: z.string().nullable(),
    vat_number: z.string().nullable(),
    tax_identification_number: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    zip_code: z.string().nullable(),
    province_code: z.string().nullable(),
    country_code: z.string().nullable(),
    billing_address: ClientAddressSchema.nullable(),
    delivery_address: ClientAddressSchema.nullable(),
    locale: z.string().nullable(),
    currency: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strip() satisfies z.ZodType<Client>;

export const ClientResponseSchema = z.object({
  client: ClientSchema,
});

export const ClientListResponseSchema = z.object({
  clients: z.array(ClientSchema),
  meta: PaginationMetaSchema,
});
