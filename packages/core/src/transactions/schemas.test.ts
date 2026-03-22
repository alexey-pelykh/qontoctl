// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { TransactionSchema, TransactionLabelSchema } from "./schemas.js";

describe("TransactionLabelSchema", () => {
  it("parses a valid transaction label", () => {
    const label = { id: "lbl-1", name: "Marketing", parent_id: "lbl-0" };
    expect(TransactionLabelSchema.parse(label)).toEqual(label);
  });

  it("accepts null parent_id", () => {
    const label = { id: "lbl-1", name: "Marketing", parent_id: null };
    expect(TransactionLabelSchema.parse(label)).toEqual(label);
  });

  it("strips unknown fields", () => {
    const label = { id: "lbl-1", name: "Marketing", parent_id: null, extra: true };
    const result = TransactionLabelSchema.parse(label);
    expect(result).not.toHaveProperty("extra");
  });

  it("throws on missing required field", () => {
    expect(() => TransactionLabelSchema.parse({ id: "lbl-1" })).toThrow();
  });
});

describe("TransactionSchema", () => {
  const validTransaction = {
    id: "txn-1",
    transaction_id: "tid-1",
    amount: 42.5,
    amount_cents: 4250,
    settled_balance: 1000.0,
    settled_balance_cents: 100000,
    local_amount: 42.5,
    local_amount_cents: 4250,
    side: "debit" as const,
    operation_type: "card",
    currency: "EUR",
    local_currency: "EUR",
    label: "Coffee Shop",
    clean_counterparty_name: "Coffee Shop Inc",
    settled_at: "2026-01-15T10:00:00Z",
    emitted_at: "2026-01-15T09:00:00Z",
    created_at: "2026-01-15T09:00:00Z",
    updated_at: "2026-01-15T10:00:00Z",
    status: "completed" as const,
    note: "Team lunch",
    reference: "REF-001",
    vat_amount: 7.08,
    vat_amount_cents: 708,
    vat_rate: 20.0,
    initiator_id: "user-1",
    label_ids: ["lbl-1", "lbl-2"],
    attachment_ids: ["att-1"],
    attachment_lost: false,
    attachment_required: true,
    card_last_digits: "1234",
    category: "meals_and_entertainment",
    subject_type: "Card",
    bank_account_id: "acc-1",
    is_external_transaction: false,
  };

  it("parses a valid transaction with all fields", () => {
    const result = TransactionSchema.parse(validTransaction);
    expect(result).toEqual(validTransaction);
  });

  it("handles nullable fields set to null", () => {
    const txn = {
      ...validTransaction,
      settled_balance: null,
      settled_balance_cents: null,
      settled_at: null,
      note: null,
      reference: null,
      vat_amount: null,
      vat_amount_cents: null,
      vat_rate: null,
      initiator_id: null,
      card_last_digits: null,
      clean_counterparty_name: null,
      created_at: null,
    };
    const result = TransactionSchema.parse(txn);
    expect(result.settled_balance).toBeNull();
    expect(result.note).toBeNull();
    expect(result.card_last_digits).toBeNull();
    expect(result.clean_counterparty_name).toBeNull();
    expect(result.created_at).toBeNull();
  });

  it("handles optional embedded labels", () => {
    const txn = {
      ...validTransaction,
      labels: [{ id: "lbl-1", name: "Marketing", parent_id: null }],
    };
    const result = TransactionSchema.parse(txn);
    expect(result.labels).toEqual([{ id: "lbl-1", name: "Marketing", parent_id: null }]);
  });

  it("handles optional embedded attachments", () => {
    const txn = {
      ...validTransaction,
      attachments: [{ id: "att-1" }],
    };
    const result = TransactionSchema.parse(txn);
    expect(result.attachments).toEqual([{ id: "att-1" }]);
  });

  it("strips unknown fields", () => {
    const txn = { ...validTransaction, unknown_field: "should be stripped" };
    const result = TransactionSchema.parse(txn);
    expect(result).not.toHaveProperty("unknown_field");
  });

  it("rejects invalid side value", () => {
    const txn = { ...validTransaction, side: "invalid" };
    expect(() => TransactionSchema.parse(txn)).toThrow();
  });

  it("rejects invalid status value", () => {
    const txn = { ...validTransaction, status: "unknown" };
    expect(() => TransactionSchema.parse(txn)).toThrow();
  });

  it("throws on missing required field", () => {
    expect(() => TransactionSchema.parse({ ...validTransaction, id: undefined })).toThrow();
  });
});
