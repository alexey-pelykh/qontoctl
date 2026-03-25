// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  IntlEligibilitySchema,
  IntlEligibilityResponseSchema,
  IntlCurrencySchema,
  IntlCurrencyListResponseSchema,
  IntlQuoteSchema,
  IntlQuoteResponseSchema,
} from "./schemas.js";

describe("IntlEligibilitySchema", () => {
  const validEligibility = {
    eligible: true,
  };

  it("accepts a valid eligibility", () => {
    const result = IntlEligibilitySchema.parse(validEligibility);
    expect(result.eligible).toBe(true);
  });

  it("accepts optional reason", () => {
    const result = IntlEligibilitySchema.parse({ ...validEligibility, reason: "account verified" });
    expect(result.reason).toBe("account verified");
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlEligibilitySchema.parse({ ...validEligibility, extra: "field" });
    expect(result).toHaveProperty("extra", "field");
  });

  it("rejects missing required fields", () => {
    expect(() => IntlEligibilitySchema.parse({})).toThrow();
  });
});

describe("IntlEligibilityResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = { eligibility: { eligible: false, reason: "not verified" } };
    const result = IntlEligibilityResponseSchema.parse(response);
    expect(result.eligibility.eligible).toBe(false);
  });
});

describe("IntlCurrencySchema", () => {
  const validCurrency = {
    code: "USD",
    name: "US Dollar",
  };

  it("accepts a valid currency", () => {
    const result = IntlCurrencySchema.parse(validCurrency);
    expect(result.code).toBe("USD");
    expect(result.name).toBe("US Dollar");
  });

  it("accepts optional min/max amounts", () => {
    const result = IntlCurrencySchema.parse({ ...validCurrency, min_amount: 10, max_amount: 100000 });
    expect(result.min_amount).toBe(10);
    expect(result.max_amount).toBe(100000);
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlCurrencySchema.parse({ ...validCurrency, extra: "field" });
    expect(result).toHaveProperty("extra", "field");
  });

  it("rejects missing required fields", () => {
    expect(() => IntlCurrencySchema.parse({ code: "USD" })).toThrow();
    expect(() => IntlCurrencySchema.parse({ name: "US Dollar" })).toThrow();
  });
});

describe("IntlCurrencyListResponseSchema", () => {
  it("validates response wrapper with array", () => {
    const response = {
      currencies: [
        { code: "USD", name: "US Dollar" },
        { code: "GBP", name: "British Pound" },
      ],
    };
    const result = IntlCurrencyListResponseSchema.parse(response);
    expect(result.currencies).toHaveLength(2);
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
