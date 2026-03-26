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
    name: z.string().nullable(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    kind: z.enum(["company", "individual", "freelancer"]),
    email: z.string().nullable(),
    vat_number: z.string().nullable().optional(),
    tax_identification_number: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    zip_code: z.string().nullable().optional(),
    province_code: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
    billing_address: ClientAddressSchema.nullable(),
    delivery_address: ClientAddressSchema.nullable().optional(),
    locale: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
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
