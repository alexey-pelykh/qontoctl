// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  CreditNoteAmountSchema,
  CreditNoteItemSchema,
  CreditNoteClientSchema,
  CreditNoteSchema,
} from "./credit-note.schema.js";

const amount = { value: "100.00", currency: "EUR" };

const item = {
  title: "Consulting",
  description: "Strategy consulting",
  quantity: "2",
  unit: "hours",
  unit_price: amount,
  unit_price_cents: 10000,
  vat_rate: "20.0",
  total_vat: amount,
  total_vat_cents: 4000,
  total_amount: amount,
  total_amount_cents: 20000,
  subtotal: amount,
  subtotal_cents: 20000,
};

const client = {
  id: "client-1",
  name: "ACME Corp",
  first_name: "John",
  last_name: "Doe",
  type: "company",
  email: "contact@acme.com",
  vat_number: "FR12345678901",
  tax_identification_number: "12345",
  address: "123 Main St",
  city: "Paris",
  zip_code: "75001",
  country_code: "FR",
  locale: "fr",
};

const validCreditNote = {
  id: "cn-1",
  invoice_id: "inv-1",
  attachment_id: "att-1",
  number: "CN-2024-001",
  issue_date: "2024-06-01",
  invoice_issue_date: "2024-05-01",
  header: "Credit Note",
  footer: "Thank you",
  terms_and_conditions: "Standard terms",
  currency: "EUR",
  vat_amount: amount,
  vat_amount_cents: 4000,
  total_amount: amount,
  total_amount_cents: 20000,
  stamp_duty_amount: "0",
  created_at: "2024-06-01T00:00:00.000Z",
  finalized_at: "2024-06-01T12:00:00.000Z",
  contact_email: "contact@acme.com",
  invoice_url: "https://example.com/invoice.pdf",
  einvoicing_status: "not_applicable",
  items: [item],
  client,
};

describe("CreditNoteAmountSchema", () => {
  it("parses a valid amount", () => {
    expect(CreditNoteAmountSchema.parse(amount)).toEqual(amount);
  });

  it("strips unknown fields", () => {
    const result = CreditNoteAmountSchema.parse({ ...amount, extra: true });
    expect(result).not.toHaveProperty("extra");
  });
});

describe("CreditNoteItemSchema", () => {
  it("parses a valid item", () => {
    expect(CreditNoteItemSchema.parse(item)).toEqual(item);
  });

  it("strips unknown fields from nested amounts", () => {
    const result = CreditNoteItemSchema.parse({
      ...item,
      unit_price: { ...amount, extra: true },
    });
    expect(result.unit_price).not.toHaveProperty("extra");
  });
});

describe("CreditNoteClientSchema", () => {
  it("parses a valid client", () => {
    expect(CreditNoteClientSchema.parse(client)).toEqual(client);
  });

  it("strips unknown fields", () => {
    const result = CreditNoteClientSchema.parse({ ...client, extra: true });
    expect(result).not.toHaveProperty("extra");
  });
});

describe("CreditNoteSchema", () => {
  it("parses a valid credit note", () => {
    const result = CreditNoteSchema.parse(validCreditNote);
    expect(result).toEqual(validCreditNote);
  });

  it("strips unknown fields from top level and nested structures", () => {
    const result = CreditNoteSchema.parse({
      ...validCreditNote,
      extra: true,
      client: { ...client, extra: true },
      items: [{ ...item, extra: true }],
    });
    expect(result).not.toHaveProperty("extra");
    expect(result.client).not.toHaveProperty("extra");
    expect(result.items[0]).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => CreditNoteSchema.parse({ id: "cn-1" })).toThrow();
  });
});
