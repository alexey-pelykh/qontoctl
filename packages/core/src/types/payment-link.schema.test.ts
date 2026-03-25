// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  PaymentLinkAmountSchema,
  PaymentLinkItemSchema,
  PaymentLinkSchema,
  PaymentLinkResponseSchema,
  PaymentLinkListResponseSchema,
  PaymentLinkPaymentSchema,
  PaymentLinkPaymentListResponseSchema,
  PaymentLinkPaymentMethodSchema,
  PaymentLinkPaymentMethodListResponseSchema,
  PaymentLinkConnectionSchema,
} from "./payment-link.schema.js";

describe("PaymentLinkAmountSchema", () => {
  it("accepts a valid amount", () => {
    const result = PaymentLinkAmountSchema.parse({ value: "100.00", currency: "EUR" });
    expect(result.value).toBe("100.00");
    expect(result.currency).toBe("EUR");
  });

  it("strips extra fields", () => {
    const result = PaymentLinkAmountSchema.parse({ value: "100.00", currency: "EUR", extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => PaymentLinkAmountSchema.parse({ value: "100.00" })).toThrow();
    expect(() => PaymentLinkAmountSchema.parse({ currency: "EUR" })).toThrow();
  });
});

describe("PaymentLinkItemSchema", () => {
  const validItem = {
    title: "Widget",
    quantity: 2,
    unit_price: { value: "10.00", currency: "EUR" },
    vat_rate: "20.0",
  };

  it("accepts a valid item", () => {
    const result = PaymentLinkItemSchema.parse(validItem);
    expect(result.title).toBe("Widget");
    expect(result.quantity).toBe(2);
  });

  it("accepts optional fields", () => {
    const result = PaymentLinkItemSchema.parse({
      ...validItem,
      type: "product",
      description: "A fine widget",
      measure_unit: "piece",
    });
    expect(result.type).toBe("product");
    expect(result.description).toBe("A fine widget");
    expect(result.measure_unit).toBe("piece");
  });

  it("strips extra fields", () => {
    const result = PaymentLinkItemSchema.parse({ ...validItem, extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => PaymentLinkItemSchema.parse({ ...validItem, title: undefined })).toThrow();
    expect(() => PaymentLinkItemSchema.parse({ ...validItem, quantity: undefined })).toThrow();
    expect(() => PaymentLinkItemSchema.parse({ ...validItem, vat_rate: undefined })).toThrow();
  });
});

describe("PaymentLinkSchema", () => {
  const validPaymentLink = {
    id: "pl-1",
    status: "open",
    expiration_date: "2025-12-31T23:59:59.000Z",
    potential_payment_methods: ["card", "transfer"],
    amount: { value: "100.00", currency: "EUR" },
    resource_type: "payment_link",
    items: null,
    reusable: false,
    invoice_id: null,
    invoice_number: null,
    debitor_name: null,
    created_at: "2025-01-01T00:00:00.000Z",
    url: "https://pay.qonto.com/pl-1",
  };

  it("accepts a valid payment link", () => {
    const result = PaymentLinkSchema.parse(validPaymentLink);
    expect(result.id).toBe("pl-1");
    expect(result.status).toBe("open");
  });

  it("accepts null for nullable fields", () => {
    const result = PaymentLinkSchema.parse(validPaymentLink);
    expect(result.items).toBeNull();
    expect(result.invoice_id).toBeNull();
    expect(result.invoice_number).toBeNull();
    expect(result.debitor_name).toBeNull();
  });

  it("accepts items array when present", () => {
    const result = PaymentLinkSchema.parse({
      ...validPaymentLink,
      items: [
        {
          title: "Widget",
          quantity: 1,
          unit_price: { value: "100.00", currency: "EUR" },
          vat_rate: "20.0",
        },
      ],
    });
    expect(result.items).toHaveLength(1);
  });

  it("strips extra fields", () => {
    const result = PaymentLinkSchema.parse({ ...validPaymentLink, extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => PaymentLinkSchema.parse({ ...validPaymentLink, id: undefined })).toThrow();
    expect(() => PaymentLinkSchema.parse({ ...validPaymentLink, status: undefined })).toThrow();
    expect(() => PaymentLinkSchema.parse({ ...validPaymentLink, url: undefined })).toThrow();
  });
});

describe("PaymentLinkResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      payment_link: {
        id: "pl-1",
        status: "open",
        expiration_date: "2025-12-31T23:59:59.000Z",
        potential_payment_methods: ["card"],
        amount: { value: "50.00", currency: "EUR" },
        resource_type: "payment_link",
        items: null,
        reusable: false,
        invoice_id: null,
        invoice_number: null,
        debitor_name: null,
        created_at: "2025-01-01T00:00:00.000Z",
        url: "https://pay.qonto.com/pl-1",
      },
    };
    const result = PaymentLinkResponseSchema.parse(response);
    expect(result.payment_link.id).toBe("pl-1");
  });
});

describe("PaymentLinkListResponseSchema", () => {
  it("validates list response with pagination", () => {
    const response = {
      payment_links: [
        {
          id: "pl-1",
          status: "open",
          expiration_date: "2025-12-31T23:59:59.000Z",
          potential_payment_methods: [],
          amount: { value: "100.00", currency: "EUR" },
          resource_type: "payment_link",
          items: null,
          reusable: false,
          invoice_id: null,
          invoice_number: null,
          debitor_name: null,
          created_at: "2025-01-01T00:00:00.000Z",
          url: "https://pay.qonto.com/pl-1",
        },
      ],
      meta: { current_page: 1, total_pages: 1, total_count: 1, per_page: 25, next_page: null, prev_page: null },
    };
    const result = PaymentLinkListResponseSchema.parse(response);
    expect(result.payment_links).toHaveLength(1);
  });
});

describe("PaymentLinkPaymentSchema", () => {
  const validPayment = {
    id: "pay-1",
    amount: { value: "100.00", currency: "EUR" },
    status: "completed",
    created_at: "2025-01-01T00:00:00.000Z",
    payment_method: "card",
    paid_at: "2025-01-01T00:05:00.000Z",
    debitor_email: "customer@example.com",
  };

  it("accepts a valid payment", () => {
    const result = PaymentLinkPaymentSchema.parse(validPayment);
    expect(result.id).toBe("pay-1");
    expect(result.status).toBe("completed");
  });

  it("accepts null for paid_at", () => {
    const result = PaymentLinkPaymentSchema.parse({ ...validPayment, paid_at: null });
    expect(result.paid_at).toBeNull();
  });

  it("strips extra fields", () => {
    const result = PaymentLinkPaymentSchema.parse({ ...validPayment, extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => PaymentLinkPaymentSchema.parse({ ...validPayment, id: undefined })).toThrow();
    expect(() => PaymentLinkPaymentSchema.parse({ ...validPayment, debitor_email: undefined })).toThrow();
  });
});

describe("PaymentLinkPaymentListResponseSchema", () => {
  it("validates list response with pagination", () => {
    const response = {
      payments: [
        {
          id: "pay-1",
          amount: { value: "100.00", currency: "EUR" },
          status: "completed",
          created_at: "2025-01-01T00:00:00.000Z",
          payment_method: "card",
          paid_at: "2025-01-01T00:05:00.000Z",
          debitor_email: "customer@example.com",
        },
      ],
      meta: { current_page: 1, total_pages: 1, total_count: 1, per_page: 25, next_page: null, prev_page: null },
    };
    const result = PaymentLinkPaymentListResponseSchema.parse(response);
    expect(result.payments).toHaveLength(1);
  });
});

describe("PaymentLinkPaymentMethodSchema", () => {
  it("accepts a valid payment method", () => {
    const result = PaymentLinkPaymentMethodSchema.parse({ name: "card", enabled: true });
    expect(result.name).toBe("card");
    expect(result.enabled).toBe(true);
  });

  it("strips extra fields", () => {
    const result = PaymentLinkPaymentMethodSchema.parse({ name: "card", enabled: true, extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => PaymentLinkPaymentMethodSchema.parse({ name: "card" })).toThrow();
    expect(() => PaymentLinkPaymentMethodSchema.parse({ enabled: true })).toThrow();
  });
});

describe("PaymentLinkPaymentMethodListResponseSchema", () => {
  it("validates response wrapper with array", () => {
    const response = {
      payment_link_payment_methods: [
        { name: "card", enabled: true },
        { name: "transfer", enabled: false },
      ],
    };
    const result = PaymentLinkPaymentMethodListResponseSchema.parse(response);
    expect(result.payment_link_payment_methods).toHaveLength(2);
  });
});

describe("PaymentLinkConnectionSchema", () => {
  it("accepts a valid connection", () => {
    const result = PaymentLinkConnectionSchema.parse({
      connection_location: "FR",
      status: "connected",
      bank_account_id: "ba-1",
    });
    expect(result.connection_location).toBe("FR");
    expect(result.status).toBe("connected");
  });

  it("strips extra fields", () => {
    const result = PaymentLinkConnectionSchema.parse({
      connection_location: "FR",
      status: "connected",
      bank_account_id: "ba-1",
      extra: "field",
    });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => PaymentLinkConnectionSchema.parse({ connection_location: "FR" })).toThrow();
  });
});
