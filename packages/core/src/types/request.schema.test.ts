// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  RequestFlashCardSchema,
  RequestVirtualCardSchema,
  RequestTransferSchema,
  RequestMultiTransferSchema,
  RequestSchema,
} from "./request.schema.js";

const baseFields = {
  id: "req-1",
  status: "pending" as const,
  initiator_id: "user-1",
  approver_id: null,
  note: "Test request",
  declined_note: null,
  processed_at: null,
  created_at: "2026-03-01T10:00:00.000Z",
};

describe("RequestFlashCardSchema", () => {
  const validFlashCard = {
    ...baseFields,
    request_type: "flash_card" as const,
    payment_lifespan_limit: "500.00",
    pre_expires_at: "2026-06-01T00:00:00.000Z",
    currency: "EUR",
  };

  it("parses a valid flash card request", () => {
    expect(RequestFlashCardSchema.parse(validFlashCard)).toEqual(validFlashCard);
  });

  it("strips unknown fields", () => {
    const result = RequestFlashCardSchema.parse({ ...validFlashCard, extra: true });
    expect(result).not.toHaveProperty("extra");
  });
});

describe("RequestVirtualCardSchema", () => {
  const validVirtualCard = {
    ...baseFields,
    request_type: "virtual_card" as const,
    payment_monthly_limit: "200.00",
    currency: "EUR",
    card_level: "virtual",
    card_design: "virtual.default.2017",
  };

  it("parses a valid virtual card request", () => {
    expect(RequestVirtualCardSchema.parse(validVirtualCard)).toEqual(validVirtualCard);
  });
});

describe("RequestTransferSchema", () => {
  const validTransfer = {
    ...baseFields,
    request_type: "transfer" as const,
    creditor_name: "Vendor A",
    amount: "150.00",
    currency: "EUR",
    scheduled_date: "2026-04-01",
    recurrence: "once",
    last_recurrence_date: null,
    attachment_ids: ["att-1"],
  };

  it("parses a valid transfer request", () => {
    expect(RequestTransferSchema.parse(validTransfer)).toEqual(validTransfer);
  });

  it("parses a transfer with empty attachment_ids", () => {
    const transfer = { ...validTransfer, attachment_ids: [] };
    expect(RequestTransferSchema.parse(transfer)).toEqual(transfer);
  });
});

describe("RequestMultiTransferSchema", () => {
  const validMultiTransfer = {
    ...baseFields,
    request_type: "multi_transfer" as const,
    total_transfers_amount: "300.00",
    total_transfers_amount_currency: "EUR",
    total_transfers_count: 2,
    scheduled_date: "2026-04-01",
  };

  it("parses a valid multi-transfer request", () => {
    expect(RequestMultiTransferSchema.parse(validMultiTransfer)).toEqual(validMultiTransfer);
  });
});

describe("RequestSchema (discriminated union)", () => {
  it("parses a flash_card request", () => {
    const data = {
      ...baseFields,
      request_type: "flash_card" as const,
      payment_lifespan_limit: "500.00",
      pre_expires_at: "2026-06-01T00:00:00.000Z",
      currency: "EUR",
    };
    const result = RequestSchema.parse(data);
    expect(result.request_type).toBe("flash_card");
  });

  it("parses a virtual_card request", () => {
    const data = {
      ...baseFields,
      request_type: "virtual_card" as const,
      payment_monthly_limit: "200.00",
      currency: "EUR",
      card_level: "virtual",
      card_design: "virtual.default.2017",
    };
    const result = RequestSchema.parse(data);
    expect(result.request_type).toBe("virtual_card");
  });

  it("parses a transfer request", () => {
    const data = {
      ...baseFields,
      request_type: "transfer" as const,
      creditor_name: "Vendor",
      amount: "100.00",
      currency: "EUR",
      scheduled_date: "2026-04-01",
      recurrence: "once",
      last_recurrence_date: null,
      attachment_ids: [],
    };
    const result = RequestSchema.parse(data);
    expect(result.request_type).toBe("transfer");
  });

  it("parses a multi_transfer request", () => {
    const data = {
      ...baseFields,
      request_type: "multi_transfer" as const,
      total_transfers_amount: "300.00",
      total_transfers_amount_currency: "EUR",
      total_transfers_count: 2,
      scheduled_date: "2026-04-01",
    };
    const result = RequestSchema.parse(data);
    expect(result.request_type).toBe("multi_transfer");
  });

  it("rejects an invalid request_type", () => {
    const data = { ...baseFields, request_type: "unknown" };
    expect(() => RequestSchema.parse(data)).toThrow();
  });

  it("rejects an invalid status", () => {
    const data = {
      ...baseFields,
      status: "invalid",
      request_type: "flash_card",
      payment_lifespan_limit: "500.00",
      pre_expires_at: "2026-06-01T00:00:00.000Z",
      currency: "EUR",
    };
    expect(() => RequestSchema.parse(data)).toThrow();
  });
});
