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

  it("parses logo when present", () => {
    const txn = {
      ...validTransaction,
      logo: { small: "https://logo.example.com/s.png", medium: "https://logo.example.com/m.png" },
    };
    const result = TransactionSchema.parse(txn);
    expect(result.logo).toEqual({
      small: "https://logo.example.com/s.png",
      medium: "https://logo.example.com/m.png",
    });
  });

  it("parses cashflow_category and cashflow_subcategory when present", () => {
    const txn = {
      ...validTransaction,
      cashflow_category: { name: "Office" },
      cashflow_subcategory: { name: "Supplies" },
    };
    const result = TransactionSchema.parse(txn);
    expect(result.cashflow_category).toEqual({ name: "Office" });
    expect(result.cashflow_subcategory).toEqual({ name: "Supplies" });
  });

  it("parses nullable embedded objects (transfer, income, etc.)", () => {
    const txn = {
      ...validTransaction,
      transfer: { beneficiary_name: "Alice" },
      income: null,
      swift_income: null,
      direct_debit: { mandate_id: "m-1" },
      direct_debit_collection: null,
      check: null,
      financing_installment: null,
      pagopa_payment: null,
      direct_debit_hold: null,
    };
    const result = TransactionSchema.parse(txn);
    expect(result.transfer).toEqual({ beneficiary_name: "Alice" });
    expect(result.income).toBeNull();
    expect(result.direct_debit).toEqual({ mandate_id: "m-1" });
    expect(result.direct_debit_hold).toBeNull();
  });

  it("omits new optional fields when absent", () => {
    const result = TransactionSchema.parse(validTransaction);
    expect(result).not.toHaveProperty("logo");
    expect(result).not.toHaveProperty("cashflow_category");
    expect(result).not.toHaveProperty("cashflow_subcategory");
    expect(result).not.toHaveProperty("transfer");
    expect(result).not.toHaveProperty("income");
    expect(result).not.toHaveProperty("swift_income");
    expect(result).not.toHaveProperty("direct_debit");
    expect(result).not.toHaveProperty("direct_debit_collection");
    expect(result).not.toHaveProperty("check");
    expect(result).not.toHaveProperty("financing_installment");
    expect(result).not.toHaveProperty("pagopa_payment");
    expect(result).not.toHaveProperty("direct_debit_hold");
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
