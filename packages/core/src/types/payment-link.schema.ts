// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import { PaginationMetaSchema } from "../api-types.schema.js";
import type {
  PaymentLink,
  PaymentLinkAmount,
  PaymentLinkConnection,
  PaymentLinkItem,
  PaymentLinkPayment,
  PaymentLinkPaymentMethod,
} from "./payment-link.js";

// https://docs.qonto.com/api-reference/business-api/payments-transfers/payment-links

export const PaymentLinkAmountSchema = z
  .object({
    value: z.string(),
    currency: z.string(),
  })
  .strip() satisfies z.ZodType<PaymentLinkAmount>;

export const PaymentLinkItemSchema = z
  .object({
    title: z.string(),
    type: z.string().optional(),
    description: z.string().optional(),
    quantity: z.number(),
    measure_unit: z.string().optional(),
    unit_price: PaymentLinkAmountSchema,
    vat_rate: z.string(),
  })
  .strip() satisfies z.ZodType<PaymentLinkItem>;

export const PaymentLinkSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    expiration_date: z.string(),
    potential_payment_methods: z.array(z.string()).readonly(),
    amount: PaymentLinkAmountSchema,
    resource_type: z.string(),
    items: z.array(PaymentLinkItemSchema).readonly().nullable(),
    reusable: z.boolean(),
    invoice_id: z.string().nullable(),
    invoice_number: z.string().nullable(),
    debitor_name: z.string().nullable(),
    created_at: z.string(),
    url: z.string(),
  })
  .strip() satisfies z.ZodType<PaymentLink>;

export const PaymentLinkResponseSchema = z
  .object({
    payment_link: PaymentLinkSchema,
  })
  .strip();

export const PaymentLinkListResponseSchema = z
  .object({
    payment_links: z.array(PaymentLinkSchema),
    meta: PaginationMetaSchema,
  })
  .strip();

export const PaymentLinkPaymentSchema = z
  .object({
    id: z.string(),
    amount: PaymentLinkAmountSchema,
    status: z.string(),
    created_at: z.string(),
    payment_method: z.string(),
    paid_at: z.string().nullable(),
    debitor_email: z.string(),
  })
  .strip() satisfies z.ZodType<PaymentLinkPayment>;

export const PaymentLinkPaymentListResponseSchema = z
  .object({
    payments: z.array(PaymentLinkPaymentSchema),
    meta: PaginationMetaSchema,
  })
  .strip();

export const PaymentLinkPaymentMethodSchema = z
  .object({
    name: z.string(),
    enabled: z.boolean(),
  })
  .strip() satisfies z.ZodType<PaymentLinkPaymentMethod>;

export const PaymentLinkPaymentMethodListResponseSchema = z
  .object({
    payment_link_payment_methods: z.array(PaymentLinkPaymentMethodSchema),
  })
  .strip();

export const PaymentLinkConnectionSchema = z
  .object({
    connection_location: z.string(),
    status: z.string(),
    bank_account_id: z.string(),
  })
  .strip() satisfies z.ZodType<PaymentLinkConnection>;
