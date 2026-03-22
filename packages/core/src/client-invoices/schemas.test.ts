// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseResponse } from "../response.js";
import {
  ClientInvoiceAmountSchema,
  ClientInvoiceDiscountSchema,
  ClientInvoiceItemSchema,
  ClientInvoiceAddressSchema,
  ClientInvoiceClientSchema,
  ClientInvoiceUploadSchema,
  ClientInvoiceSchema,
} from "./schemas.js";

describe("ClientInvoiceAmountSchema", () => {
  it("parses a valid amount", () => {
    const data = { value: "100.00", currency: "EUR" };
    expect(ClientInvoiceAmountSchema.parse(data)).toEqual(data);
  });

  it("strips unknown fields", () => {
    const data = { value: "100.00", currency: "EUR", extra: true };
    const result = ClientInvoiceAmountSchema.parse(data);
    expect(result).not.toHaveProperty("extra");
  });
});

describe("ClientInvoiceDiscountSchema", () => {
  it("parses a percentage discount", () => {
    const data = {
      type: "percentage" as const,
      value: "10",
      amount: { value: "10.00", currency: "EUR" },
      amount_cents: 1000,
    };
    expect(ClientInvoiceDiscountSchema.parse(data)).toEqual(data);
  });

  it("parses an amount discount", () => {
    const data = {
      type: "amount" as const,
      value: "5.00",
      amount: { value: "5.00", currency: "EUR" },
      amount_cents: 500,
    };
    expect(ClientInvoiceDiscountSchema.parse(data)).toEqual(data);
  });

  it("rejects invalid discount type", () => {
    const data = {
      type: "invalid",
      value: "10",
      amount: { value: "10.00", currency: "EUR" },
      amount_cents: 1000,
    };
    expect(() => ClientInvoiceDiscountSchema.parse(data)).toThrow();
  });
});

describe("ClientInvoiceItemSchema", () => {
  const validItem = {
    title: "Consulting",
    description: null,
    quantity: "2",
    unit: "hours",
    vat_rate: "20.0",
    vat_exemption_reason: null,
    unit_price: { value: "100.00", currency: "EUR" },
    unit_price_cents: 10000,
    total_amount: { value: "200.00", currency: "EUR" },
    total_amount_cents: 20000,
    total_vat: { value: "40.00", currency: "EUR" },
    total_vat_cents: 4000,
    subtotal: { value: "200.00", currency: "EUR" },
    subtotal_cents: 20000,
    discount: null,
  };

  it("parses a valid item", () => {
    expect(ClientInvoiceItemSchema.parse(validItem)).toEqual(validItem);
  });

  it("parses an item with discount", () => {
    const item = {
      ...validItem,
      discount: {
        type: "percentage" as const,
        value: "10",
        amount: { value: "20.00", currency: "EUR" },
        amount_cents: 2000,
      },
    };
    expect(ClientInvoiceItemSchema.parse(item)).toEqual(item);
  });
});

describe("ClientInvoiceAddressSchema", () => {
  it("parses a full address", () => {
    const data = {
      street_address: "123 Main St",
      city: "Paris",
      zip_code: "75001",
      province_code: "IDF",
      country_code: "FR",
    };
    expect(ClientInvoiceAddressSchema.parse(data)).toEqual(data);
  });

  it("parses an address with all nulls", () => {
    const data = {
      street_address: null,
      city: null,
      zip_code: null,
      province_code: null,
      country_code: null,
    };
    expect(ClientInvoiceAddressSchema.parse(data)).toEqual(data);
  });
});

describe("ClientInvoiceClientSchema", () => {
  const validClient = {
    id: "client-1",
    type: "company" as const,
    name: "Acme Corp",
    first_name: null,
    last_name: null,
    email: "billing@acme.com",
    vat_number: "FR12345678901",
    tax_identification_number: null,
    address: "123 Main St",
    city: "Paris",
    zip_code: "75001",
    province_code: null,
    country_code: "FR",
    recipient_code: null,
    locale: "fr",
    billing_address: null,
    delivery_address: null,
  };

  it("parses a valid client", () => {
    expect(ClientInvoiceClientSchema.parse(validClient)).toEqual(validClient);
  });

  it("parses a client with nested addresses", () => {
    const client = {
      ...validClient,
      billing_address: {
        street_address: "123 Main St",
        city: "Paris",
        zip_code: "75001",
        province_code: null,
        country_code: "FR",
      },
      delivery_address: {
        street_address: "456 Elm St",
        city: "Lyon",
        zip_code: "69001",
        province_code: null,
        country_code: "FR",
      },
    };
    expect(ClientInvoiceClientSchema.parse(client)).toEqual(client);
  });

  it("accepts all nullable fields set to null", () => {
    const result = ClientInvoiceClientSchema.parse({
      ...validClient,
      name: null,
      first_name: null,
      last_name: null,
      email: null,
      vat_number: null,
      tax_identification_number: null,
      address: null,
      city: null,
      zip_code: null,
      province_code: null,
      country_code: null,
      recipient_code: null,
      locale: null,
      billing_address: null,
      delivery_address: null,
    });
    expect(result.name).toBeNull();
    expect(result.email).toBeNull();
    expect(result.vat_number).toBeNull();
    expect(result.address).toBeNull();
    expect(result.city).toBeNull();
    expect(result.zip_code).toBeNull();
    expect(result.country_code).toBeNull();
    expect(result.locale).toBeNull();
  });

  it("rejects invalid client type", () => {
    expect(() => ClientInvoiceClientSchema.parse({ ...validClient, type: "unknown" })).toThrow();
  });
});

describe("ClientInvoiceUploadSchema", () => {
  it("parses a valid upload", () => {
    const data = {
      id: "upload-1",
      file_name: "invoice.pdf",
      file_size: 12345,
      file_content_type: "application/pdf",
      url: "https://example.com/invoice.pdf",
      created_at: "2026-03-01T10:00:00.000Z",
    };
    expect(ClientInvoiceUploadSchema.parse(data)).toEqual(data);
  });
});

describe("ClientInvoiceSchema", () => {
  const validInvoice = {
    id: "inv-1",
    organization_id: "org-1",
    invoice_number: "INV-001",
    status: "draft" as const,
    client_id: "client-1",
    currency: "EUR",
    total_amount: { value: "240.00", currency: "EUR" },
    total_amount_cents: 24000,
    vat_amount: { value: "40.00", currency: "EUR" },
    vat_amount_cents: 4000,
    issue_date: "2026-03-01",
    due_date: "2026-04-01",
    created_at: "2026-03-01T10:00:00.000Z",
    updated_at: "2026-03-01T10:00:00.000Z",
    attachment_id: null,
    contact_email: "billing@acme.com",
    terms_and_conditions: null,
    header: null,
    footer: null,
    discount: null,
    items: [
      {
        title: "Consulting",
        description: null,
        quantity: "2",
        unit: "hours",
        vat_rate: "20.0",
        vat_exemption_reason: null,
        unit_price: { value: "100.00", currency: "EUR" },
        unit_price_cents: 10000,
        total_amount: { value: "200.00", currency: "EUR" },
        total_amount_cents: 20000,
        total_vat: { value: "40.00", currency: "EUR" },
        total_vat_cents: 4000,
        subtotal: { value: "200.00", currency: "EUR" },
        subtotal_cents: 20000,
        discount: null,
      },
    ],
    client: {
      id: "client-1",
      type: "company" as const,
      name: "Acme Corp",
      first_name: null,
      last_name: null,
      email: "billing@acme.com",
      vat_number: null,
      tax_identification_number: null,
      address: null,
      city: null,
      zip_code: null,
      province_code: null,
      country_code: null,
      recipient_code: null,
      locale: null,
      billing_address: null,
      delivery_address: null,
    },
  };

  it("parses a valid invoice", () => {
    expect(ClientInvoiceSchema.parse(validInvoice)).toEqual(validInvoice);
  });

  it("validates via parseResponse with wrapper", () => {
    const wrapped = { client_invoice: validInvoice };
    const wrapperSchema = z.object({ client_invoice: ClientInvoiceSchema });
    const result = parseResponse(wrapperSchema, wrapped, "/v2/client_invoices/inv-1");
    expect(result.client_invoice).toEqual(validInvoice);
  });

  it("rejects invalid status", () => {
    expect(() => ClientInvoiceSchema.parse({ ...validInvoice, status: "unknown" })).toThrow();
  });

  it("accepts all nullable fields set to null", () => {
    const result = ClientInvoiceSchema.parse({
      ...validInvoice,
      invoice_number: null,
      issue_date: null,
      due_date: null,
      attachment_id: null,
      contact_email: null,
      terms_and_conditions: null,
      header: null,
      footer: null,
      discount: null,
    });
    expect(result.invoice_number).toBeNull();
    expect(result.issue_date).toBeNull();
    expect(result.due_date).toBeNull();
    expect(result.contact_email).toBeNull();
  });

  it("strips unknown fields from nested objects", () => {
    const invoiceWithExtra = {
      ...validInvoice,
      extra_field: "should be stripped",
      client: {
        ...validInvoice.client,
        unknown_field: "also stripped",
      },
    };
    const result = ClientInvoiceSchema.parse(invoiceWithExtra);
    expect(result).not.toHaveProperty("extra_field");
    expect(result.client).not.toHaveProperty("unknown_field");
  });
});
