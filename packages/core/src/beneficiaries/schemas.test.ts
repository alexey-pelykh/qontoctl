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
    const result = BeneficiarySchema.parse({ ...validBeneficiary, bic: null, email: null, activity_tag: null });
    expect(result.bic).toBeNull();
    expect(result.email).toBeNull();
    expect(result.activity_tag).toBeNull();
  });

  it("defaults absent bic, email, and activity_tag to null", () => {
    const input = { ...validBeneficiary };
    delete (input as Record<string, unknown>).bic;
    delete (input as Record<string, unknown>).email;
    delete (input as Record<string, unknown>).activity_tag;
    const result = BeneficiarySchema.parse(input);
    expect(result.bic).toBeNull();
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

  it("hoists iban and bic from nested bank_account (regression: #514)", () => {
    // Production returns flat `iban`/`bic`. The Qonto sandbox wraps both
    // under `bank_account: { iban, bic, currency }`. The schema's
    // preprocess hoists the nested values so downstream consumers always
    // see flat fields.
    const sandboxShape = {
      id: "ben-2",
      name: "Sandbox SARL",
      status: "validated",
      trusted: true,
      created_at: "2026-05-09T10:00:00.000Z",
      updated_at: "2026-05-09T10:00:00.000Z",
      bank_account: {
        iban: "FR7630001007941234567890185",
        bic: "QNTOFRP1XXX",
        currency: "EUR",
      },
    };
    const result = BeneficiarySchema.parse(sandboxShape);
    expect(result.iban).toBe("FR7630001007941234567890185");
    expect(result.bic).toBe("QNTOFRP1XXX");
    expect(result).not.toHaveProperty("bank_account");
  });

  it("hoists null bic from nested bank_account", () => {
    const sandboxShape = {
      id: "ben-3",
      name: "Foreign bank",
      status: "validated" as const,
      trusted: false,
      created_at: "2026-05-09T10:00:00.000Z",
      updated_at: "2026-05-09T10:00:00.000Z",
      bank_account: { iban: "DE89370400440532013000", bic: null, currency: "EUR" },
    };
    const result = BeneficiarySchema.parse(sandboxShape);
    expect(result.iban).toBe("DE89370400440532013000");
    expect(result.bic).toBeNull();
  });

  it("flat fields take precedence over nested bank_account fields", () => {
    // If both flat and nested are present, the flat field wins. This
    // matches the production contract — preprocess only fills absent
    // flat fields from `bank_account`.
    const mixedShape = {
      ...validBeneficiary,
      bank_account: { iban: "DIFFERENT", bic: "DIFFERENT", currency: "EUR" },
    };
    const result = BeneficiarySchema.parse(mixedShape);
    expect(result.iban).toBe(validBeneficiary.iban);
    expect(result.bic).toBe(validBeneficiary.bic);
  });

  it("accepts flat top-level `currency` (regression: #621)", () => {
    // Production returns `currency` as a flat top-level field per the
    // SepaBeneficiary schema; surfaced by the contract probe (#621). The
    // field is declared `.nullable().optional()` so absence in legacy
    // beneficiaries does not fail validation.
    const result = BeneficiarySchema.parse({ ...validBeneficiary, currency: "EUR" });
    expect(result.currency).toBe("EUR");
  });

  it("hoists currency from nested bank_account (regression: #621)", () => {
    // The Qonto sandbox wraps the currency under `bank_account.currency`.
    // The schema's preprocess hoists it alongside `iban`/`bic` so that
    // downstream consumers see a single flat `.currency` field regardless
    // of environment.
    const sandboxShape = {
      id: "ben-4",
      name: "Sandbox EUR",
      status: "validated" as const,
      trusted: true,
      created_at: "2026-05-18T10:00:00.000Z",
      updated_at: "2026-05-18T10:00:00.000Z",
      bank_account: {
        iban: "FR7630001007941234567890185",
        bic: "QNTOFRP1XXX",
        currency: "EUR",
      },
    };
    const result = BeneficiarySchema.parse(sandboxShape);
    expect(result.currency).toBe("EUR");
    expect(result).not.toHaveProperty("bank_account");
  });

  it("flat top-level currency takes precedence over nested bank_account.currency", () => {
    // Mirror of the iban/bic precedence test for #621.
    const mixedShape = {
      ...validBeneficiary,
      currency: "EUR",
      bank_account: { iban: "DIFFERENT", bic: "DIFFERENT", currency: "USD" },
    };
    const result = BeneficiarySchema.parse(mixedShape);
    expect(result.currency).toBe("EUR");
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
