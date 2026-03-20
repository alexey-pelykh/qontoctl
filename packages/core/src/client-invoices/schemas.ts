// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type {
  ClientInvoice,
  ClientInvoiceAddress,
  ClientInvoiceAmount,
  ClientInvoiceClient,
  ClientInvoiceDiscount,
  ClientInvoiceItem,
  ClientInvoiceUpload,
} from "./types.js";

export const ClientInvoiceAmountSchema = z.object({
  value: z.string(),
  currency: z.string(),
}) satisfies z.ZodType<ClientInvoiceAmount>;

export const ClientInvoiceDiscountSchema = z.object({
  type: z.enum(["percentage", "amount"]),
  value: z.string(),
  amount: ClientInvoiceAmountSchema,
  amount_cents: z.number(),
}) satisfies z.ZodType<ClientInvoiceDiscount>;

export const ClientInvoiceItemSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  quantity: z.string(),
  unit: z.string().nullable(),
  vat_rate: z.string(),
  vat_exemption_reason: z.string().nullable(),
  unit_price: ClientInvoiceAmountSchema,
  unit_price_cents: z.number(),
  total_amount: ClientInvoiceAmountSchema,
  total_amount_cents: z.number(),
  total_vat: ClientInvoiceAmountSchema,
  total_vat_cents: z.number(),
  subtotal: ClientInvoiceAmountSchema,
  subtotal_cents: z.number(),
  discount: ClientInvoiceDiscountSchema.nullable(),
}) satisfies z.ZodType<ClientInvoiceItem>;

export const ClientInvoiceAddressSchema = z.object({
  street_address: z.string().nullable(),
  city: z.string().nullable(),
  zip_code: z.string().nullable(),
  province_code: z.string().nullable(),
  country_code: z.string().nullable(),
}) satisfies z.ZodType<ClientInvoiceAddress>;

export const ClientInvoiceClientSchema = z.object({
  id: z.string(),
  type: z.enum(["individual", "company", "freelancer"]),
  name: z.string().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  vat_number: z.string().nullable(),
  tax_identification_number: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  zip_code: z.string().nullable(),
  province_code: z.string().nullable(),
  country_code: z.string().nullable(),
  recipient_code: z.string().nullable(),
  locale: z.string().nullable(),
  billing_address: ClientInvoiceAddressSchema.nullable(),
  delivery_address: ClientInvoiceAddressSchema.nullable(),
}) satisfies z.ZodType<ClientInvoiceClient>;

export const ClientInvoiceUploadSchema = z.object({
  id: z.string(),
  file_name: z.string(),
  file_size: z.number(),
  file_content_type: z.string(),
  url: z.string(),
  created_at: z.string(),
}) satisfies z.ZodType<ClientInvoiceUpload>;

export const ClientInvoiceSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  invoice_number: z.string().nullable(),
  status: z.enum(["draft", "pending", "paid", "cancelled"]),
  client_id: z.string(),
  currency: z.string(),
  total_amount: ClientInvoiceAmountSchema,
  total_amount_cents: z.number(),
  vat_amount: ClientInvoiceAmountSchema,
  vat_amount_cents: z.number(),
  issue_date: z.string().nullable(),
  due_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  attachment_id: z.string().nullable(),
  contact_email: z.string().nullable(),
  terms_and_conditions: z.string().nullable(),
  header: z.string().nullable(),
  footer: z.string().nullable(),
  discount: ClientInvoiceDiscountSchema.nullable(),
  items: z.array(ClientInvoiceItemSchema),
  client: ClientInvoiceClientSchema,
}) satisfies z.ZodType<ClientInvoice>;

export const ClientInvoiceResponseSchema = z.object({
  client_invoice: ClientInvoiceSchema,
});

export const ClientInvoiceListResponseSchema = z.object({
  client_invoices: z.array(ClientInvoiceSchema),
  meta: PaginationMetaSchema,
});
