// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { getRecurringTransfer } from "./service.js";

describe("getRecurringTransfer", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches a recurring transfer by ID", async () => {
    const recurringTransfer = {
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
      frequency: "monthly",
      status: "active",
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ recurring_transfer: recurringTransfer }));

    const result = await getRecurringTransfer(client, "rt-1");
    expect(result).toEqual(recurringTransfer);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers/rt-1");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        recurring_transfer: {
          id: "a/b",
          initiator_id: "user-1",
          bank_account_id: "acc-1",
          amount: 100,
          amount_cents: 10000,
          amount_currency: "EUR",
          beneficiary_id: "ben-1",
          reference: "ref",
          note: "",
          first_execution_date: "2026-01-01",
          last_execution_date: null,
          next_execution_date: "2026-02-01",
          frequency: "monthly",
          status: "active",
          created_at: "2026-01-01T10:00:00Z",
          updated_at: "2026-01-01T10:00:00Z",
        },
      }),
    );

    await getRecurringTransfer(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/recurring_transfers/a%2Fb");
  });
});
