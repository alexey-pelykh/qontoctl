// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { buildClientInvoiceQueryParams } from "./service.js";
import type { ListClientInvoicesParams } from "./types.js";

describe("buildClientInvoiceQueryParams", () => {
  it("returns empty object for empty params", () => {
    const result = buildClientInvoiceQueryParams({});
    expect(result).toEqual({});
  });

  it("maps status array to filter[status]", () => {
    const params: ListClientInvoicesParams = { status: ["draft", "pending"] };
    const result = buildClientInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[status]": ["draft", "pending"] });
  });

  it("maps date filter params", () => {
    const params: ListClientInvoicesParams = {
      created_at_from: "2026-01-01",
      created_at_to: "2026-01-31",
      updated_at_from: "2026-02-01",
      updated_at_to: "2026-02-28",
      due_date: "2026-03-15",
      due_date_from: "2026-03-01",
      due_date_to: "2026-03-31",
    };
    const result = buildClientInvoiceQueryParams(params);
    expect(result).toEqual({
      "filter[created_at_from]": "2026-01-01",
      "filter[created_at_to]": "2026-01-31",
      "filter[updated_at_from]": "2026-02-01",
      "filter[updated_at_to]": "2026-02-28",
      "filter[due_date]": "2026-03-15",
      "filter[due_date_from]": "2026-03-01",
      "filter[due_date_to]": "2026-03-31",
    });
  });

  it("maps exclude_imported as string", () => {
    const params: ListClientInvoicesParams = { exclude_imported: true };
    const result = buildClientInvoiceQueryParams(params);
    expect(result).toEqual({ exclude_imported: "true" });
  });

  it("maps sort_by as top-level param", () => {
    const params: ListClientInvoicesParams = { sort_by: "created_at:desc" };
    const result = buildClientInvoiceQueryParams(params);
    expect(result).toEqual({ sort_by: "created_at:desc" });
  });

  it("maps all params together", () => {
    const params: ListClientInvoicesParams = {
      status: ["paid"],
      created_at_from: "2026-01-01",
      due_date_to: "2026-12-31",
      exclude_imported: false,
      sort_by: "due_date:asc",
    };
    const result = buildClientInvoiceQueryParams(params);
    expect(result).toEqual({
      "filter[status]": ["paid"],
      "filter[created_at_from]": "2026-01-01",
      "filter[due_date_to]": "2026-12-31",
      exclude_imported: "false",
      sort_by: "due_date:asc",
    });
  });

  it("skips undefined params", () => {
    const params: ListClientInvoicesParams = {
      status: ["draft"],
      created_at_from: undefined,
      sort_by: undefined,
    };
    const result = buildClientInvoiceQueryParams(params);
    expect(result).toEqual({ "filter[status]": ["draft"] });
  });
});
