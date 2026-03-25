// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { BeneficiarySchema, BeneficiaryResponseSchema } from "./schemas.js";

describe("BeneficiarySchema", () => {
  const validBeneficiary = {
    id: "ben-1",
    name: "Acme Corp",
    iban: "FR7630001007941234567890185",
    bic: "BNPAFRPP",
    email: "acme@example.com",
    activity_tag: "consulting",
    status: "validated" as const,
    trusted: true,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-02T00:00:00.000Z",
  };

  it("accepts a valid beneficiary", () => {
    const result = BeneficiarySchema.parse(validBeneficiary);
    expect(result).toEqual(validBeneficiary);
  });

  it("accepts null for nullable fields", () => {
    const result = BeneficiarySchema.parse({ ...validBeneficiary, email: null, activity_tag: null });
    expect(result.email).toBeNull();
    expect(result.activity_tag).toBeNull();
  });

  it("defaults absent email and activity_tag to null", () => {
    const input = { ...validBeneficiary };
    delete (input as Record<string, unknown>).email;
    delete (input as Record<string, unknown>).activity_tag;
    const result = BeneficiarySchema.parse(input);
    expect(result.email).toBeNull();
    expect(result.activity_tag).toBeNull();
  });

  it("strips extra fields", () => {
    const result = BeneficiarySchema.parse({ ...validBeneficiary, extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => BeneficiarySchema.parse({ ...validBeneficiary, id: undefined })).toThrow();
  });

  it("rejects invalid status", () => {
    expect(() => BeneficiarySchema.parse({ ...validBeneficiary, status: "unknown" })).toThrow();
  });
});

describe("BeneficiaryResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      beneficiary: {
        id: "ben-1",
        name: "Acme Corp",
        iban: "FR7630001007941234567890185",
        bic: "BNPAFRPP",
        email: null,
        activity_tag: null,
        status: "pending",
        trusted: false,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    };
    const result = BeneficiaryResponseSchema.parse(response);
    expect(result.beneficiary.id).toBe("ben-1");
  });
});
