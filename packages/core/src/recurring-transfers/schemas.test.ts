// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { RecurringTransferSchema } from "./schemas.js";

describe("RecurringTransferSchema", () => {
  const validRecurringTransfer = {
    id: "rt-1",
    initiator_id: "user-1",
    bank_account_id: "acc-1",
    amount: 100.5,
    amount_cents: 10050,
    amount_currency: "EUR",
    beneficiary_id: "ben-1",
    reference: "Monthly rent",
    note: "Rent payment",
    first_execution_date: "2026-01-01",
    last_execution_date: null,
    next_execution_date: "2026-02-01",
    frequency: "monthly" as const,
    status: "active",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
  };

  it("parses a valid recurring transfer", () => {
    const result = RecurringTransferSchema.parse(validRecurringTransfer);
    expect(result).toEqual(validRecurringTransfer);
  });

  it("accepts all frequency values", () => {
    for (const frequency of ["weekly", "monthly", "quarterly", "half_yearly", "yearly"] as const) {
      const rt = { ...validRecurringTransfer, frequency };
      expect(RecurringTransferSchema.parse(rt).frequency).toBe(frequency);
    }
  });

  it("handles nullable last_execution_date", () => {
    const result = RecurringTransferSchema.parse(validRecurringTransfer);
    expect(result.last_execution_date).toBeNull();
  });

  it("accepts non-null last_execution_date", () => {
    const rt = { ...validRecurringTransfer, last_execution_date: "2026-12-01" };
    const result = RecurringTransferSchema.parse(rt);
    expect(result.last_execution_date).toBe("2026-12-01");
  });

  it("strips unknown fields", () => {
    const rt = { ...validRecurringTransfer, extra: true };
    const result = RecurringTransferSchema.parse(rt);
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects invalid frequency", () => {
    const rt = { ...validRecurringTransfer, frequency: "daily" };
    expect(() => RecurringTransferSchema.parse(rt)).toThrow();
  });

  it("throws on missing required field", () => {
    expect(() => RecurringTransferSchema.parse({ ...validRecurringTransfer, id: undefined })).toThrow();
  });
});
