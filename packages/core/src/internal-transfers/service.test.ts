// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { createInternalTransfer } from "./service.js";

describe("createInternalTransfer", () => {
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

  it("creates an internal transfer and returns the result", async () => {
    const internalTransfer = {
      id: "it-1",
      debit_iban: "FR7630001007941234567890185",
      credit_iban: "FR7630001007949876543210142",
      debit_bank_account_id: "ba-1",
      credit_bank_account_id: "ba-2",
      reference: "Monthly allocation",
      amount: 1000.0,
      amount_cents: 100000,
      currency: "EUR",
      status: "processing",
      created_at: "2026-03-01T10:00:00Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ internal_transfer: internalTransfer }));

    const result = await createInternalTransfer(client, {
      debit_iban: "FR7630001007941234567890185",
      credit_iban: "FR7630001007949876543210142",
      reference: "Monthly allocation",
      amount: 1000.0,
      currency: "EUR",
    });

    expect(result).toEqual(internalTransfer);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/internal_transfers");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      internal_transfer: {
        debit_iban: "FR7630001007941234567890185",
        credit_iban: "FR7630001007949876543210142",
        reference: "Monthly allocation",
        amount: 1000.0,
        currency: "EUR",
      },
    });
  });

  it("passes idempotency key when provided", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        internal_transfer: {
          id: "it-2",
          debit_iban: "FR76X",
          credit_iban: "FR76Y",
          debit_bank_account_id: "ba-1",
          credit_bank_account_id: "ba-2",
          reference: "Test",
          amount: 50.0,
          amount_cents: 5000,
          currency: "EUR",
          status: "processing",
          created_at: "2026-03-01T10:00:00Z",
        },
      }),
    );

    await createInternalTransfer(
      client,
      {
        debit_iban: "FR76X",
        credit_iban: "FR76Y",
        reference: "Test",
        amount: 50.0,
        currency: "EUR",
      },
      { idempotencyKey: "key-123" },
    );

    const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-123");
  });
});
