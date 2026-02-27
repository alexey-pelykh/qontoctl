// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { getBankAccount } from "./bank-accounts.js";

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("getBankAccount", () => {
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

  it("returns the bank account from the API response", async () => {
    const account = {
      id: "acc-1",
      name: "Main Account",
      status: "active",
      main: true,
      organization_id: "org-1",
      iban: "FR7630006000011234567890189",
      bic: "BNPAFRPP",
      currency: "EUR",
      balance: 10000.5,
      balance_cents: 1000050,
      authorized_balance: 9500.0,
      authorized_balance_cents: 950000,
      slug: "acme-corp-main",
    };
    fetchSpy.mockReturnValue(jsonResponse({ bank_account: account }));

    const result = await getBankAccount(client, "acc-1");

    expect(result).toEqual(account);
    expect(result.id).toBe("acc-1");
    expect(result.name).toBe("Main Account");
  });

  it("calls the correct API endpoint with encoded ID", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        bank_account: {
          id: "acc-1",
          name: "Test",
          status: "active",
          main: false,
          organization_id: "org-1",
          iban: "FR76",
          bic: "BNPA",
          currency: "EUR",
          balance: 0,
          balance_cents: 0,
          authorized_balance: 0,
          authorized_balance_cents: 0,
          slug: "test",
        },
      }),
    );

    await getBankAccount(client, "acc-1");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/bank_accounts/acc-1");
  });
});
