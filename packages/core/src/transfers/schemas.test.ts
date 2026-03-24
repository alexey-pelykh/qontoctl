// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  TransferSchema,
  TransferResponseSchema,
  VopMatchResultSchema,
  VopResultSchema,
  VopResultResponseSchema,
  BulkVopResultEntrySchema,
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

describe("VopMatchResultSchema", () => {
  it("accepts all valid match result values", () => {
    for (const value of [
      "MATCH_RESULT_MATCH",
      "MATCH_RESULT_CLOSE_MATCH",
      "MATCH_RESULT_NO_MATCH",
      "MATCH_RESULT_NOT_POSSIBLE",
      "MATCH_RESULT_UNSPECIFIED",
    ]) {
      expect(VopMatchResultSchema.parse(value)).toBe(value);
    }
  });

  it("rejects invalid match result", () => {
    expect(() => VopMatchResultSchema.parse("match")).toThrow();
    expect(() => VopMatchResultSchema.parse("invalid")).toThrow();
  });
});

describe("VopResultSchema", () => {
  it("accepts a valid VoP result", () => {
    const result = VopResultSchema.parse({
      match_result: "MATCH_RESULT_MATCH",
      matched_name: null,
      proof_token: { token: "tok_abc123" },
    });
    expect(result.match_result).toBe("MATCH_RESULT_MATCH");
    expect(result.matched_name).toBeNull();
    expect(result.proof_token.token).toBe("tok_abc123");
  });

  it("accepts close match with matched_name", () => {
    const result = VopResultSchema.parse({
      match_result: "MATCH_RESULT_CLOSE_MATCH",
      matched_name: "Acme Corp",
      proof_token: { token: "tok_xyz" },
    });
    expect(result.match_result).toBe("MATCH_RESULT_CLOSE_MATCH");
    expect(result.matched_name).toBe("Acme Corp");
  });

  it("defaults matched_name to null when absent", () => {
    const result = VopResultSchema.parse({
      match_result: "MATCH_RESULT_MATCH",
      proof_token: { token: "tok_no_name" },
    });
    expect(result.matched_name).toBeNull();
  });

  it("rejects invalid match_result", () => {
    expect(() =>
      VopResultSchema.parse({
        match_result: "invalid",
        matched_name: null,
        proof_token: { token: "tok_abc123" },
      }),
    ).toThrow();
  });

  it("rejects missing proof_token", () => {
    expect(() =>
      VopResultSchema.parse({
        match_result: "MATCH_RESULT_MATCH",
        matched_name: null,
      }),
    ).toThrow();
  });

  it("rejects missing match_result", () => {
    expect(() =>
      VopResultSchema.parse({
        matched_name: null,
        proof_token: { token: "tok_abc123" },
      }),
    ).toThrow();
  });

  it("strips extra fields from result", () => {
    const result = VopResultSchema.parse({
      match_result: "MATCH_RESULT_MATCH",
      matched_name: null,
      proof_token: { token: "tok_abc123" },
      extra_field: "should be stripped",
    });
    expect(result).not.toHaveProperty("extra_field");
  });
});

describe("VopResultResponseSchema", () => {
  it("validates single verification response", () => {
    const response = {
      match_result: "MATCH_RESULT_MATCH",
      matched_name: null,
      proof_token: { token: "tok_abc123" },
    };
    const result = VopResultResponseSchema.parse(response);
    expect(result.match_result).toBe("MATCH_RESULT_MATCH");
    expect(result.proof_token.token).toBe("tok_abc123");
  });

  it("validates close match response with matched_name", () => {
    const response = {
      match_result: "MATCH_RESULT_CLOSE_MATCH",
      matched_name: "Acme Corporation",
      proof_token: { token: "tok_close" },
    };
    const result = VopResultResponseSchema.parse(response);
    expect(result.match_result).toBe("MATCH_RESULT_CLOSE_MATCH");
    expect(result.matched_name).toBe("Acme Corporation");
  });

  it("validates not_possible response", () => {
    const response = {
      match_result: "MATCH_RESULT_NOT_POSSIBLE",
      matched_name: null,
      proof_token: { token: "tok_not_possible" },
    };
    const result = VopResultResponseSchema.parse(response);
    expect(result.match_result).toBe("MATCH_RESULT_NOT_POSSIBLE");
    expect(result.matched_name).toBeNull();
  });
});

describe("BulkVopResultEntrySchema", () => {
  it("accepts a successful entry", () => {
    const result = BulkVopResultEntrySchema.parse({
      id: "0",
      response: { match_result: "MATCH_RESULT_MATCH", matched_name: null },
    });
    expect(result.id).toBe("0");
    expect(result.response?.match_result).toBe("MATCH_RESULT_MATCH");
  });

  it("defaults matched_name to null when absent in response", () => {
    const result = BulkVopResultEntrySchema.parse({
      id: "0",
      response: { match_result: "MATCH_RESULT_MATCH" },
    });
    expect(result.response?.matched_name).toBeNull();
  });

  it("accepts an error entry", () => {
    const result = BulkVopResultEntrySchema.parse({
      id: "1",
      error: { code: "BANK_UNAVAILABLE", detail: "Bank not reachable" },
    });
    expect(result.id).toBe("1");
    expect(result.error?.code).toBe("BANK_UNAVAILABLE");
  });
});

describe("BulkVopResultResponseSchema", () => {
  it("validates bulk verification response", () => {
    const response = {
      responses: [
        { id: "0", response: { match_result: "MATCH_RESULT_MATCH", matched_name: null } },
        { id: "1", response: { match_result: "MATCH_RESULT_NO_MATCH", matched_name: null } },
      ],
      proof_token: { token: "tok_batch" },
    };
    const result = BulkVopResultResponseSchema.parse(response);
    expect(result.responses).toHaveLength(2);
    expect(result.proof_token.token).toBe("tok_batch");
  });

  it("accepts empty responses array", () => {
    const result = BulkVopResultResponseSchema.parse({
      responses: [],
      proof_token: { token: "tok_empty" },
    });
    expect(result.responses).toHaveLength(0);
  });

  it("accepts mixed success and error entries", () => {
    const response = {
      responses: [
        { id: "0", response: { match_result: "MATCH_RESULT_MATCH", matched_name: null } },
        { id: "1", error: { code: "BANK_ERROR", detail: "Timeout" } },
      ],
      proof_token: { token: "tok_mixed" },
    };
    const result = BulkVopResultResponseSchema.parse(response);
    expect(result.responses).toHaveLength(2);
    expect(result.responses[0]?.response?.match_result).toBe("MATCH_RESULT_MATCH");
    expect(result.responses[1]?.error?.code).toBe("BANK_ERROR");
  });

  it("rejects missing proof_token", () => {
    expect(() =>
      BulkVopResultResponseSchema.parse({
        responses: [{ id: "0", response: { match_result: "MATCH_RESULT_MATCH", matched_name: null } }],
      }),
    ).toThrow();
  });

  it("rejects missing responses", () => {
    expect(() =>
      BulkVopResultResponseSchema.parse({
        proof_token: { token: "tok_no_responses" },
      }),
    ).toThrow();
  });
});
