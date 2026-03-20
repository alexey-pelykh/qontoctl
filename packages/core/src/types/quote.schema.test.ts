// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  QuoteAmountSchema,
  QuoteDiscountSchema,
  QuoteItemSchema,
  QuoteAddressSchema,
  QuoteClientSchema,
  QuoteSchema,
} from "./quote.schema.js";

const amount = { value: "100.00", currency: "EUR" };

const discount = {
  type: "percentage" as const,
  value: "10",
  amount,
  amount_cents: 1000,
};

const item = {
  title: "Consulting",
  description: "Strategy consulting",
  quantity: "2",
  unit: "hours",
  vat_rate: "20.0",
  vat_exemption_reason: null,
  unit_price: amount,
  unit_price_cents: 10000,
  total_amount: amount,
  total_amount_cents: 20000,
  total_vat: amount,
  total_vat_cents: 4000,
  subtotal: amount,
  subtotal_cents: 20000,
  discount: null,
};

const address = {
  street_address: "123 Main St",
  city: "Paris",
  zip_code: "75001",
  province_code: null,
  country_code: "FR",
};

const client = {
  id: "client-1",
  type: "company" as const,
  name: "ACME Corp",
  first_name: null,
  last_name: null,
  email: "contact@acme.com",
  vat_number: "FR12345678901",
  tax_identification_number: null,
  address: "123 Main St",
  city: "Paris",
  zip_code: "75001",
  province_code: null,
  country_code: "FR",
  recipient_code: null,
  locale: "fr",
  billing_address: address,
  delivery_address: null,
};

const validQuote = {
  id: "quote-1",
  organization_id: "org-1",
  number: "Q-2024-001",
  status: "pending_approval" as const,
  currency: "EUR",
  total_amount: amount,
  total_amount_cents: 24000,
  vat_amount: amount,
  vat_amount_cents: 4000,
  issue_date: "2024-01-01",
  expiry_date: "2024-02-01",
  created_at: "2024-01-01T00:00:00.000Z",
  approved_at: null,
  canceled_at: null,
  attachment_id: null,
  quote_url: null,
  contact_email: "contact@acme.com",
  terms_and_conditions: "Net 30",
  header: null,
  footer: null,
  discount: null,
  items: [item],
  client,
  invoice_ids: [],
};

describe("QuoteAmountSchema", () => {
  it("parses a valid amount", () => {
    expect(QuoteAmountSchema.parse(amount)).toEqual(amount);
  });

  it("strips unknown fields", () => {
    const result = QuoteAmountSchema.parse({ ...amount, extra: true });
    expect(result).not.toHaveProperty("extra");
  });
});

describe("QuoteDiscountSchema", () => {
  it("parses a valid discount", () => {
    expect(QuoteDiscountSchema.parse(discount)).toEqual(discount);
  });

  it("validates type enum", () => {
    expect(() => QuoteDiscountSchema.parse({ ...discount, type: "fixed" })).toThrow();
  });
});

describe("QuoteItemSchema", () => {
  it("parses a valid item", () => {
    expect(QuoteItemSchema.parse(item)).toEqual(item);
  });

  it("parses an item with discount", () => {
    const result = QuoteItemSchema.parse({ ...item, discount });
    expect(result.discount).toEqual(discount);
  });

  it("strips unknown fields from nested amounts", () => {
    const result = QuoteItemSchema.parse({
      ...item,
      unit_price: { ...amount, extra: true },
    });
    expect(result.unit_price).not.toHaveProperty("extra");
  });
});

describe("QuoteAddressSchema", () => {
  it("parses a valid address", () => {
    expect(QuoteAddressSchema.parse(address)).toEqual(address);
  });

  it("parses with all nulls", () => {
    const allNull = { street_address: null, city: null, zip_code: null, province_code: null, country_code: null };
    expect(QuoteAddressSchema.parse(allNull)).toEqual(allNull);
  });
});

describe("QuoteClientSchema", () => {
  it("parses a valid client", () => {
    expect(QuoteClientSchema.parse(client)).toEqual(client);
  });

  it("validates type enum", () => {
    for (const type of ["individual", "company", "freelancer"]) {
      expect(() => QuoteClientSchema.parse({ ...client, type })).not.toThrow();
    }
    expect(() => QuoteClientSchema.parse({ ...client, type: "other" })).toThrow();
  });

  it("strips unknown fields from nested address", () => {
    const result = QuoteClientSchema.parse({
      ...client,
      billing_address: { ...address, extra: true },
    });
    expect(result.billing_address).not.toHaveProperty("extra");
  });
});

describe("QuoteSchema", () => {
  it("parses a valid quote", () => {
    const result = QuoteSchema.parse(validQuote);
    expect(result).toEqual(validQuote);
  });

  it("validates status enum", () => {
    for (const status of ["pending_approval", "approved", "canceled"]) {
      expect(() => QuoteSchema.parse({ ...validQuote, status })).not.toThrow();
    }
    expect(() => QuoteSchema.parse({ ...validQuote, status: "draft" })).toThrow();
  });

  it("strips unknown fields from top level and nested structures", () => {
    const result = QuoteSchema.parse({
      ...validQuote,
      extra: true,
      client: { ...client, extra: true },
      items: [{ ...item, extra: true }],
    });
    expect(result).not.toHaveProperty("extra");
    expect(result.client).not.toHaveProperty("extra");
    expect(result.items[0]).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => QuoteSchema.parse({ id: "quote-1" })).toThrow();
  });
});
