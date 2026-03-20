// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  TransferSchema,
  TransferResponseSchema,
  VopResultSchema,
  VopResultResponseSchema,
  BulkVopResultResponseSchema,
} from "./schemas.js";

describe("TransferSchema", () => {
  const validTransfer = {
    id: "tr-1",
    initiator_id: "user-1",
    bank_account_id: "ba-1",
    beneficiary_id: "ben-1",
    amount: 100.5,
    amount_cents: 10050,
    amount_currency: "EUR",
    status: "pending" as const,
    reference: "INV-001",
    note: "Payment for services",
    scheduled_date: "2025-03-01",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    processed_at: null,
    completed_at: null,
    transaction_id: null,
    recurring_transfer_id: null,
    declined_reason: null,
  };

  it("accepts a valid transfer", () => {
    const result = TransferSchema.parse(validTransfer);
    expect(result).toEqual(validTransfer);
  });

  it("accepts all valid status values", () => {
    for (const status of ["pending", "processing", "canceled", "declined", "settled"]) {
      const result = TransferSchema.parse({ ...validTransfer, status });
      expect(result.status).toBe(status);
    }
  });

  it("accepts null for nullable fields", () => {
    const result = TransferSchema.parse(validTransfer);
    expect(result.note).toBe("Payment for services");
    expect(result.processed_at).toBeNull();
  });

  it("strips extra fields", () => {
    const result = TransferSchema.parse({ ...validTransfer, extra: "field" });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => TransferSchema.parse({ ...validTransfer, id: undefined })).toThrow();
  });

  it("rejects invalid status", () => {
    expect(() => TransferSchema.parse({ ...validTransfer, status: "unknown" })).toThrow();
  });
});

describe("TransferResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      transfer: {
        id: "tr-1",
        initiator_id: "user-1",
        bank_account_id: "ba-1",
        beneficiary_id: "ben-1",
        amount: 100,
        amount_cents: 10000,
        amount_currency: "EUR",
        status: "settled",
        reference: "REF",
        note: null,
        scheduled_date: "2025-03-01",
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
        processed_at: "2025-01-02T00:00:00.000Z",
        completed_at: "2025-01-03T00:00:00.000Z",
        transaction_id: "txn-1",
        recurring_transfer_id: null,
        declined_reason: null,
      },
    };
    const result = TransferResponseSchema.parse(response);
    expect(result.transfer.id).toBe("tr-1");
  });
});

describe("VopResultSchema", () => {
  it("accepts a valid VoP result", () => {
    const result = VopResultSchema.parse({ iban: "FR76...", name: "Acme", result: "match" });
    expect(result.result).toBe("match");
  });

  it("accepts all valid result values", () => {
    for (const value of ["match", "mismatch", "not_available"]) {
      const result = VopResultSchema.parse({ iban: "FR76...", name: "Acme", result: value });
      expect(result.result).toBe(value);
    }
  });

  it("rejects invalid result", () => {
    expect(() => VopResultSchema.parse({ iban: "FR76...", name: "Acme", result: "invalid" })).toThrow();
  });
});

describe("VopResultResponseSchema", () => {
  it("validates single verification response", () => {
    const response = { verification: { iban: "FR76...", name: "Acme", result: "match" } };
    const result = VopResultResponseSchema.parse(response);
    expect(result.verification.result).toBe("match");
  });
});

describe("BulkVopResultResponseSchema", () => {
  it("validates bulk verification response", () => {
    const response = {
      verifications: [
        { iban: "FR76...", name: "Acme", result: "match" },
        { iban: "DE89...", name: "Beta", result: "mismatch" },
      ],
    };
    const result = BulkVopResultResponseSchema.parse(response);
    expect(result.verifications).toHaveLength(2);
  });

  it("accepts empty array", () => {
    const result = BulkVopResultResponseSchema.parse({ verifications: [] });
    expect(result.verifications).toHaveLength(0);
  });
});
