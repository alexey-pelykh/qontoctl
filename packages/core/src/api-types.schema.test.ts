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

  it("coerces string balance fields to numbers", () => {
    const result = BankAccountSchema.parse({
      ...validBankAccount,
      balance: "10000.50",
      balance_cents: "1000050",
      authorized_balance: "9500.00",
      authorized_balance_cents: "950000",
    });
    expect(result.balance).toBe(10000.5);
    expect(result.balance_cents).toBe(1000050);
    expect(result.authorized_balance).toBe(9500);
    expect(result.authorized_balance_cents).toBe(950000);
  });

  it("accepts missing optional slug and organization_id", () => {
    const input = { ...validBankAccount };
    delete (input as Record<string, unknown>).slug;
    delete (input as Record<string, unknown>).organization_id;
    const result = BankAccountSchema.parse(input);
    expect(result.slug).toBeUndefined();
    expect(result.organization_id).toBeUndefined();
  });

  it("accepts optional is_external_account, account_number, and updated_at", () => {
    const result = BankAccountSchema.parse({
      ...validBankAccount,
      is_external_account: false,
      account_number: "123456789",
      updated_at: "2026-03-24T12:00:00.000Z",
    });
    expect(result.is_external_account).toBe(false);
    expect(result.account_number).toBe("123456789");
    expect(result.updated_at).toBe("2026-03-24T12:00:00.000Z");
  });

  it("accepts null account_number", () => {
    const result = BankAccountSchema.parse({
      ...validBankAccount,
      account_number: null,
    });
    expect(result.account_number).toBeNull();
  });

  it("accepts missing optional is_external_account, account_number, and updated_at", () => {
    const result = BankAccountSchema.parse(validBankAccount);
    expect(result.is_external_account).toBeUndefined();
    expect(result.account_number).toBeUndefined();
    expect(result.updated_at).toBeUndefined();
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

  it("accepts null legal_name", () => {
    const result = OrganizationSchema.parse({ ...validOrg, legal_name: null });
    expect(result.legal_name).toBeNull();
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

  it("accepts missing prev_page (API returns previous_page which gets stripped)", () => {
    const input = { ...validMeta };
    delete (input as Record<string, unknown>).prev_page;
    const result = PaginationMetaSchema.parse(input);
    expect(result.prev_page).toBeUndefined();
  });

  it("strips unknown fields", () => {
    const result = PaginationMetaSchema.parse({ ...validMeta, extra: true });
    expect(result).not.toHaveProperty("extra");
  });
});
