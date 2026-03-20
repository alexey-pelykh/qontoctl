// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { BankAccountSchema, OrganizationSchema, PaginationMetaSchema } from "./api-types.schema.js";

const validBankAccount = {
  id: "acc-1",
  name: "Main Account",
  status: "active",
  main: true,
  organization_id: "org-1",
  iban: "FR7630001007941234567890185",
  bic: "BNPAFRPP",
  currency: "EUR",
  balance: 10000.5,
  balance_cents: 1000050,
  authorized_balance: 9500.0,
  authorized_balance_cents: 950000,
  slug: "main-account",
};

describe("BankAccountSchema", () => {
  it("parses a valid bank account", () => {
    const result = BankAccountSchema.parse(validBankAccount);
    expect(result).toEqual(validBankAccount);
  });

  it("strips unknown fields", () => {
    const result = BankAccountSchema.parse({ ...validBankAccount, extra: true });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => BankAccountSchema.parse({ id: "acc-1" })).toThrow();
  });
});

describe("OrganizationSchema", () => {
  const validOrg = {
    slug: "acme-corp",
    legal_name: "ACME Corporation",
    bank_accounts: [validBankAccount],
  };

  it("parses a valid organization", () => {
    const result = OrganizationSchema.parse(validOrg);
    expect(result).toEqual(validOrg);
  });

  it("strips unknown fields from org and nested bank accounts", () => {
    const result = OrganizationSchema.parse({
      ...validOrg,
      extra: true,
      bank_accounts: [{ ...validBankAccount, extra: true }],
    });
    expect(result).not.toHaveProperty("extra");
    expect(result.bank_accounts[0]).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => OrganizationSchema.parse({ slug: "acme" })).toThrow();
  });
});

describe("PaginationMetaSchema", () => {
  const validMeta = {
    current_page: 1,
    next_page: 2,
    prev_page: null,
    total_pages: 5,
    total_count: 100,
    per_page: 20,
  };

  it("parses valid pagination meta", () => {
    const result = PaginationMetaSchema.parse(validMeta);
    expect(result).toEqual(validMeta);
  });

  it("parses with null next_page and prev_page", () => {
    const result = PaginationMetaSchema.parse({ ...validMeta, next_page: null });
    expect(result.next_page).toBeNull();
  });

  it("strips unknown fields", () => {
    const result = PaginationMetaSchema.parse({ ...validMeta, extra: true });
    expect(result).not.toHaveProperty("extra");
  });
});
