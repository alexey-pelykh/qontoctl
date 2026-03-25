// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  IntlBeneficiarySchema,
  IntlBeneficiaryResponseSchema,
  IntlBeneficiaryListResponseSchema,
  IntlBeneficiaryRequirementFieldSchema,
  IntlBeneficiaryRequirementsSchema,
  IntlBeneficiaryRequirementsResponseSchema,
} from "./schemas.js";

describe("IntlBeneficiarySchema", () => {
  const validBeneficiary = {
    id: "intl-ben-1",
    name: "Acme Corp",
    country: "US",
    currency: "USD",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-06-01T00:00:00.000Z",
  };

  it("accepts a valid beneficiary", () => {
    const result = IntlBeneficiarySchema.parse(validBeneficiary);
    expect(result.id).toBe("intl-ben-1");
    expect(result.country).toBe("US");
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlBeneficiarySchema.parse({ ...validBeneficiary, extra: "field" });
    expect(result).toHaveProperty("extra", "field");
  });

  it("rejects missing required fields", () => {
    expect(() => IntlBeneficiarySchema.parse({ ...validBeneficiary, id: undefined })).toThrow();
    expect(() => IntlBeneficiarySchema.parse({ ...validBeneficiary, name: undefined })).toThrow();
    expect(() => IntlBeneficiarySchema.parse({ ...validBeneficiary, country: undefined })).toThrow();
  });
});

describe("IntlBeneficiaryResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      international_beneficiary: {
        id: "intl-ben-1",
        name: "Acme Corp",
        country: "US",
        currency: "USD",
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-06-01T00:00:00.000Z",
      },
    };
    const result = IntlBeneficiaryResponseSchema.parse(response);
    expect(result.international_beneficiary.id).toBe("intl-ben-1");
  });
});

describe("IntlBeneficiaryListResponseSchema", () => {
  it("validates list response with pagination", () => {
    const response = {
      international_beneficiaries: [
        {
          id: "intl-ben-1",
          name: "Acme Corp",
          country: "US",
          currency: "USD",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-06-01T00:00:00.000Z",
        },
      ],
      meta: { current_page: 1, total_pages: 1, total_count: 1, per_page: 25, next_page: null, prev_page: null },
    };
    const result = IntlBeneficiaryListResponseSchema.parse(response);
    expect(result.international_beneficiaries).toHaveLength(1);
  });
});

describe("IntlBeneficiaryRequirementFieldSchema", () => {
  const validField = {
    key: "account_number",
    name: "Account Number",
    type: "text",
  };

  it("accepts a valid requirement field", () => {
    const result = IntlBeneficiaryRequirementFieldSchema.parse(validField);
    expect(result.key).toBe("account_number");
  });

  it("accepts optional fields", () => {
    const result = IntlBeneficiaryRequirementFieldSchema.parse({
      ...validField,
      example: "123456789",
      validation_regexp: "^[0-9]+$",
      min_length: 5,
      max_length: 20,
    });
    expect(result.example).toBe("123456789");
    expect(result.min_length).toBe(5);
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlBeneficiaryRequirementFieldSchema.parse({ ...validField, extra: "field" });
    expect(result).toHaveProperty("extra", "field");
  });

  it("rejects missing required fields", () => {
    expect(() => IntlBeneficiaryRequirementFieldSchema.parse({ key: "k", name: "n" })).toThrow();
  });
});

describe("IntlBeneficiaryRequirementsSchema", () => {
  it("accepts valid requirements", () => {
    const result = IntlBeneficiaryRequirementsSchema.parse({
      fields: [{ key: "account_number", name: "Account Number", type: "text" }],
    });
    expect(result.fields).toHaveLength(1);
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlBeneficiaryRequirementsSchema.parse({
      fields: [],
      extra: "field",
    });
    expect(result).toHaveProperty("extra", "field");
  });
});

describe("IntlBeneficiaryRequirementsResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      requirements: {
        fields: [{ key: "iban", name: "IBAN", type: "text" }],
      },
    };
    const result = IntlBeneficiaryRequirementsResponseSchema.parse(response);
    expect(result.requirements.fields).toHaveLength(1);
  });
});
