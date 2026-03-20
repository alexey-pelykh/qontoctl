// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { BulkTransferSchema, BulkTransferResultSchema, BulkTransferResultErrorSchema } from "./schemas.js";

describe("BulkTransferResultErrorSchema", () => {
  it("parses a valid error", () => {
    const error = { code: "invalid_iban", detail: "IBAN is not valid" };
    expect(BulkTransferResultErrorSchema.parse(error)).toEqual(error);
  });

  it("strips unknown fields", () => {
    const error = { code: "invalid_iban", detail: "IBAN is not valid", extra: true };
    const result = BulkTransferResultErrorSchema.parse(error);
    expect(result).not.toHaveProperty("extra");
  });

  it("throws on missing required field", () => {
    expect(() => BulkTransferResultErrorSchema.parse({ code: "err" })).toThrow();
  });
});

describe("BulkTransferResultSchema", () => {
  it("parses a successful result", () => {
    const result = {
      client_transfer_id: "ct-1",
      transfer_id: "tr-1",
      status: "completed" as const,
      errors: [],
    };
    expect(BulkTransferResultSchema.parse(result)).toEqual(result);
  });

  it("handles null transfer_id for failed transfers", () => {
    const result = {
      client_transfer_id: "ct-2",
      transfer_id: null,
      status: "failed" as const,
      errors: [{ code: "insufficient_funds", detail: "Not enough balance" }],
    };
    const parsed = BulkTransferResultSchema.parse(result);
    expect(parsed.transfer_id).toBeNull();
    expect(parsed.errors).toHaveLength(1);
  });

  it("rejects invalid status", () => {
    const result = {
      client_transfer_id: "ct-1",
      transfer_id: "tr-1",
      status: "unknown",
      errors: [],
    };
    expect(() => BulkTransferResultSchema.parse(result)).toThrow();
  });
});

describe("BulkTransferSchema", () => {
  const validBulkTransfer = {
    id: "bt-1",
    initiator_id: "user-1",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-01-15T10:05:00Z",
    total_count: 3,
    completed_count: 2,
    pending_count: 0,
    failed_count: 1,
    results: [
      { client_transfer_id: "ct-1", transfer_id: "tr-1", status: "completed" as const, errors: [] },
      { client_transfer_id: "ct-2", transfer_id: "tr-2", status: "completed" as const, errors: [] },
      {
        client_transfer_id: "ct-3",
        transfer_id: null,
        status: "failed" as const,
        errors: [{ code: "invalid_iban", detail: "IBAN is not valid" }],
      },
    ],
  };

  it("parses a valid bulk transfer with results", () => {
    const result = BulkTransferSchema.parse(validBulkTransfer);
    expect(result).toEqual(validBulkTransfer);
  });

  it("parses a bulk transfer with empty results", () => {
    const bt = { ...validBulkTransfer, results: [], total_count: 0, completed_count: 0, failed_count: 0 };
    const result = BulkTransferSchema.parse(bt);
    expect(result.results).toEqual([]);
  });

  it("strips unknown fields", () => {
    const bt = { ...validBulkTransfer, extra: true };
    const result = BulkTransferSchema.parse(bt);
    expect(result).not.toHaveProperty("extra");
  });

  it("throws on missing required field", () => {
    expect(() => BulkTransferSchema.parse({ ...validBulkTransfer, id: undefined })).toThrow();
  });
});
