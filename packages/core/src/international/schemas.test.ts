// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  IntlEligibilitySchema,
  IntlCurrencySchema,
  IntlCurrencyListResponseSchema,
  IntlQuoteSchema,
  IntlQuoteResponseSchema,
} from "./schemas.js";

describe("IntlEligibilitySchema", () => {
  // Mirrors the actual sandbox response — the endpoint returns the eligibility
  // flat (no `eligibility` wrapper).
  const validEligibility = {
    status: "STATUS_INELIGIBLE",
    reason: "REASON_UNKNOWN",
  };

  it("accepts the actual sandbox response shape", () => {
    const result = IntlEligibilitySchema.parse(validEligibility);
    expect(result.status).toBe("STATUS_INELIGIBLE");
    expect(result.reason).toBe("REASON_UNKNOWN");
  });

  it("accepts eligibility without reason", () => {
    const result = IntlEligibilitySchema.parse({ status: "STATUS_ELIGIBLE" });
    expect(result.status).toBe("STATUS_ELIGIBLE");
    expect(result.reason).toBeUndefined();
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlEligibilitySchema.parse({ ...validEligibility, extra: "field" });
    expect(result).toHaveProperty("extra", "field");
  });

  it("rejects missing required fields", () => {
    expect(() => IntlEligibilitySchema.parse({})).toThrow();
    expect(() => IntlEligibilitySchema.parse({ reason: "REASON_UNKNOWN" })).toThrow();
  });

  it("rejects non-string status", () => {
    expect(() => IntlEligibilitySchema.parse({ status: true })).toThrow();
  });
});

describe("IntlCurrencySchema", () => {
  // Mirrors the actual sandbox response: `country_code` + `currency_code` +
  // optional `suggestion_priority`.
  const validCurrency = {
    country_code: "US",
    currency_code: "USD",
  };

  it("accepts a valid currency", () => {
    const result = IntlCurrencySchema.parse(validCurrency);
    expect(result.currency_code).toBe("USD");
    expect(result.country_code).toBe("US");
  });

  it("accepts optional suggestion_priority", () => {
    const result = IntlCurrencySchema.parse({ ...validCurrency, suggestion_priority: 6 });
    expect(result.suggestion_priority).toBe(6);
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlCurrencySchema.parse({ ...validCurrency, extra: "field" });
    expect(result).toHaveProperty("extra", "field");
  });

  it("rejects missing required fields", () => {
    expect(() => IntlCurrencySchema.parse({ currency_code: "USD" })).toThrow();
    expect(() => IntlCurrencySchema.parse({ country_code: "US" })).toThrow();
  });
});

describe("IntlCurrencyListResponseSchema", () => {
  it("validates response wrapper with array (real sandbox shape)", () => {
    const response = {
      currencies: [
        { country_code: "US", currency_code: "USD", suggestion_priority: 6 },
        { country_code: "GB", currency_code: "GBP", suggestion_priority: 5 },
        { country_code: "MA", currency_code: "MAD" },
      ],
    };
    const result = IntlCurrencyListResponseSchema.parse(response);
    expect(result.currencies).toHaveLength(3);
    expect(result.currencies[0]?.currency_code).toBe("USD");
  });
});

describe("IntlQuoteSchema", () => {
  const validQuote = {
    id: "quote-1",
    source_currency: "EUR",
    target_currency: "USD",
    source_amount: 1000,
    target_amount: 1085.5,
    rate: 1.0855,
    fee_amount: 5.0,
    fee_currency: "EUR",
    expires_at: "2025-06-01T01:00:00.000Z",
  };

  it("accepts a valid quote", () => {
    const result = IntlQuoteSchema.parse(validQuote);
    expect(result.id).toBe("quote-1");
    expect(result.rate).toBe(1.0855);
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlQuoteSchema.parse({ ...validQuote, extra: "field" });
    expect(result).toHaveProperty("extra", "field");
  });

  it("rejects missing required fields", () => {
    expect(() => IntlQuoteSchema.parse({ ...validQuote, id: undefined })).toThrow();
    expect(() => IntlQuoteSchema.parse({ ...validQuote, rate: undefined })).toThrow();
  });

  it("rejects non-numeric amounts", () => {
    expect(() => IntlQuoteSchema.parse({ ...validQuote, source_amount: "not-a-number" })).toThrow();
  });
});

describe("IntlQuoteResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      quote: {
        id: "quote-1",
        source_currency: "EUR",
        target_currency: "USD",
        source_amount: 1000,
        target_amount: 1085.5,
        rate: 1.0855,
        fee_amount: 5.0,
        fee_currency: "EUR",
        expires_at: "2025-06-01T01:00:00.000Z",
      },
    };
    const result = IntlQuoteResponseSchema.parse(response);
    expect(result.quote.id).toBe("quote-1");
  });
});
