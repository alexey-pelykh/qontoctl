// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { buildSupplierInvoiceQueryParams } from "./service.js";
import type { ListSupplierInvoicesParams } from "./types.js";

describe("buildSupplierInvoiceQueryParams", () => {
  it("returns empty object for empty params", () => {
    const result = buildSupplierInvoiceQueryParams({});
    expect(result).toEqual({});
  });

  it("maps status array to filter[status][]", () => {
    const params: ListSupplierInvoicesParams = { status: ["paid", "pending"] };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[status][]": ["paid", "pending"] });
  });

  it("skips status when array is empty", () => {
    const params: ListSupplierInvoicesParams = { status: [] };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({});
  });

  it("maps due_date to filter[due_date]", () => {
    const params: ListSupplierInvoicesParams = { due_date: "past_and_today" };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[due_date]": "past_and_today" });
  });

  it("maps date range filter params", () => {
    const params: ListSupplierInvoicesParams = {
      created_at_from: "2026-01-01",
      created_at_to: "2026-01-31",
      updated_at_from: "2026-02-01",
      updated_at_to: "2026-02-28",
    };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({
      "filter[created_at_from]": "2026-01-01",
      "filter[created_at_to]": "2026-01-31",
      "filter[updated_at_from]": "2026-02-01",
      "filter[updated_at_to]": "2026-02-28",
    });
  });

  it("maps query as top-level param", () => {
    const params: ListSupplierInvoicesParams = { query: "acme" };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ query: "acme" });
  });

  it("maps sort_by as top-level param", () => {
    const params: ListSupplierInvoicesParams = { sort_by: "created_at:desc" };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ sort_by: "created_at:desc" });
  });

  it("maps attachment_id to filter[attachment_id]", () => {
    const params: ListSupplierInvoicesParams = { attachment_id: "att-1" };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[attachment_id]": "att-1" });
  });

  it("maps attachment_ids to filter[attachment_id][]", () => {
    const params: ListSupplierInvoicesParams = { attachment_ids: ["att-1", "att-2"] };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[attachment_id][]": ["att-1", "att-2"] });
  });

  it("skips attachment_ids when array is empty", () => {
    const params: ListSupplierInvoicesParams = { attachment_ids: [] };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({});
  });

  it("maps payment_date to filter[payment_date]", () => {
    const params: ListSupplierInvoicesParams = { payment_date: "2026-03-15" };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[payment_date]": "2026-03-15" });
  });

  it("maps issue_date to filter[issue_date]", () => {
    const params: ListSupplierInvoicesParams = { issue_date: "2026-03-01" };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[issue_date]": "2026-03-01" });
  });

  it("maps issue_date_from to filter[issue_date_from]", () => {
    const params: ListSupplierInvoicesParams = { issue_date_from: "2026-01-01" };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[issue_date_from]": "2026-01-01" });
  });

  it("maps missing_data boolean to filter[missing_data] string", () => {
    const params: ListSupplierInvoicesParams = { missing_data: true };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[missing_data]": "true" });
  });

  it("maps missing_data false to string", () => {
    const params: ListSupplierInvoicesParams = { missing_data: false };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[missing_data]": "false" });
  });

  it("maps matched_transactions boolean to filter[matched_transactions] string", () => {
    const params: ListSupplierInvoicesParams = { matched_transactions: true };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[matched_transactions]": "true" });
  });

  it("maps document_type to filter[document_type]", () => {
    const params: ListSupplierInvoicesParams = { document_type: "invoice" };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[document_type]": "invoice" });
  });

  it("maps approver_ids to filter[approver_id][]", () => {
    const params: ListSupplierInvoicesParams = { approver_ids: ["user-1", "user-2"] };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[approver_id][]": ["user-1", "user-2"] });
  });

  it("skips approver_ids when array is empty", () => {
    const params: ListSupplierInvoicesParams = { approver_ids: [] };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({});
  });

  it("maps exclude_credit_notes boolean to filter[exclude_credit_notes] string", () => {
    const params: ListSupplierInvoicesParams = { exclude_credit_notes: true };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[exclude_credit_notes]": "true" });
  });

  it("maps payable_amount to filter[payable_amount]", () => {
    const params: ListSupplierInvoicesParams = { payable_amount: "100.00" };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[payable_amount]": "100.00" });
  });

  it("maps query_fields as top-level param", () => {
    const params: ListSupplierInvoicesParams = { query_fields: "supplier_name" };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ query_fields: "supplier_name" });
  });

  it("maps all params together", () => {
    const params: ListSupplierInvoicesParams = {
      status: ["paid"],
      due_date: "future",
      created_at_from: "2026-01-01",
      attachment_id: "att-1",
      payment_date: "2026-03-15",
      issue_date: "2026-03-01",
      issue_date_from: "2026-01-01",
      missing_data: true,
      matched_transactions: false,
      document_type: "invoice",
      approver_ids: ["user-1"],
      exclude_credit_notes: true,
      payable_amount: "500.00",
      query: "acme",
      query_fields: "supplier_name",
      sort_by: "created_at:desc",
    };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({
      "filter[status][]": ["paid"],
      "filter[due_date]": "future",
      "filter[created_at_from]": "2026-01-01",
      "filter[attachment_id]": "att-1",
      "filter[payment_date]": "2026-03-15",
      "filter[issue_date]": "2026-03-01",
      "filter[issue_date_from]": "2026-01-01",
      "filter[missing_data]": "true",
      "filter[matched_transactions]": "false",
      "filter[document_type]": "invoice",
      "filter[approver_id][]": ["user-1"],
      "filter[exclude_credit_notes]": "true",
      "filter[payable_amount]": "500.00",
      query: "acme",
      query_fields: "supplier_name",
      sort_by: "created_at:desc",
    });
  });

  it("skips undefined params", () => {
    const params: ListSupplierInvoicesParams = {
      status: ["draft"],
      attachment_id: undefined,
      missing_data: undefined,
      query_fields: undefined,
    };
    const result = buildSupplierInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[status][]": ["draft"] });
  });
});
