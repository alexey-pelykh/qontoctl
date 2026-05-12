// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import {
  TerminalAmountSchema,
  TerminalListResponseSchema,
  TerminalPaymentResponseSchema,
  TerminalPaymentSchema,
  TerminalSchema,
} from "./schemas.js";

describe("TerminalAmountSchema", () => {
  it("accepts a decimal-string value and EUR currency", () => {
    const result = TerminalAmountSchema.parse({ value: "12.50", currency: "EUR" });
    expect(result.value).toBe("12.50");
    expect(result.currency).toBe("EUR");
  });

  it("rejects non-EUR currencies", () => {
    expect(() => TerminalAmountSchema.parse({ value: "12.50", currency: "USD" })).toThrow();
  });

  it("rejects numeric values (must be decimal string)", () => {
    expect(() => TerminalAmountSchema.parse({ value: 12.5, currency: "EUR" })).toThrow();
  });
});

describe("TerminalSchema", () => {
  it("accepts a full terminal object", () => {
    const result = TerminalSchema.parse({
      id: "term-1",
      poi_id: "POI-001",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(result.id).toBe("term-1");
    expect(result.poi_id).toBe("POI-001");
  });

  it("strips unknown fields", () => {
    const result = TerminalSchema.parse({
      id: "term-1",
      poi_id: "POI-001",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      // Forward-compat: API might add fields. `.strip()` discards them.
      extra: "ignored",
    });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects when required fields are missing", () => {
    expect(() =>
      TerminalSchema.parse({
        id: "term-1",
        // poi_id missing
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("TerminalListResponseSchema", () => {
  it("parses an empty list", () => {
    const result = TerminalListResponseSchema.parse({
      terminals: [],
      meta: {
        current_page: 1,
        next_page: null,
        prev_page: null,
        total_pages: 1,
        total_count: 0,
        per_page: 100,
      },
    });
    expect(result.terminals).toEqual([]);
    expect(result.meta.total_count).toBe(0);
  });

  it("parses a populated list", () => {
    const result = TerminalListResponseSchema.parse({
      terminals: [
        {
          id: "term-1",
          poi_id: "POI-001",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      meta: {
        current_page: 1,
        next_page: null,
        prev_page: null,
        total_pages: 1,
        total_count: 1,
        per_page: 100,
      },
    });
    expect(result.terminals).toHaveLength(1);
  });
});

describe("TerminalPaymentSchema", () => {
  it("parses a payment without metadata", () => {
    const result = TerminalPaymentSchema.parse({
      id: "pay-1",
      terminal_id: "term-1",
      amount: { value: "12.50", currency: "EUR" },
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(result.metadata).toBeUndefined();
  });

  it("parses a payment with arbitrary metadata", () => {
    const result = TerminalPaymentSchema.parse({
      id: "pay-2",
      terminal_id: "term-1",
      amount: { value: "12.50", currency: "EUR" },
      metadata: { order_id: "ord-42", nested: { table: 7 } },
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(result.metadata).toEqual({ order_id: "ord-42", nested: { table: 7 } });
  });
});

describe("TerminalPaymentResponseSchema", () => {
  it("unwraps terminal_payment under its envelope", () => {
    const result = TerminalPaymentResponseSchema.parse({
      terminal_payment: {
        id: "pay-1",
        terminal_id: "term-1",
        amount: { value: "12.50", currency: "EUR" },
        created_at: "2026-01-01T00:00:00Z",
      },
    });
    expect(result.terminal_payment.id).toBe("pay-1");
  });
});
