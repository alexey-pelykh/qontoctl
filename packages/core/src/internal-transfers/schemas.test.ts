// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { InternalTransferSchema, InternalTransferResponseSchema } from "./schemas.js";

describe("InternalTransferSchema", () => {
  const validInternalTransfer = {
    id: "it-1",
    debit_iban: "FR7630001007941234567890185",
    credit_iban: "FR7630001007949876543210185",
    debit_bank_account_id: "ba-1",
    credit_bank_account_id: "ba-2",
    reference: "Internal transfer",
    amount: 500,
    amount_cents: 50000,
    currency: "EUR",
    status: "completed",
    created_at: "2025-01-01T00:00:00.000Z",
  };

  it("accepts a valid internal transfer", () => {
    const result = InternalTransferSchema.parse(validInternalTransfer);
    expect(result).toEqual(validInternalTransfer);
  });

  it("strips extra fields", () => {
    const result = InternalTransferSchema.parse({ ...validInternalTransfer, extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => InternalTransferSchema.parse({ ...validInternalTransfer, id: undefined })).toThrow();
  });

  it("rejects wrong type for amount", () => {
    expect(() => InternalTransferSchema.parse({ ...validInternalTransfer, amount: "500" })).toThrow();
  });
});

describe("InternalTransferResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      internal_transfer: {
        id: "it-1",
        debit_iban: "FR7630001007941234567890185",
        credit_iban: "FR7630001007949876543210185",
        debit_bank_account_id: "ba-1",
        credit_bank_account_id: "ba-2",
        reference: "Internal transfer",
        amount: 500,
        amount_cents: 50000,
        currency: "EUR",
        status: "completed",
        created_at: "2025-01-01T00:00:00.000Z",
      },
    };
    const result = InternalTransferResponseSchema.parse(response);
    expect(result.internal_transfer.id).toBe("it-1");
  });
});
