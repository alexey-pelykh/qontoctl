// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { getOrganization } from "./organization.js";

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("getOrganization", () => {
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

  it("returns the organization from the API response", async () => {
    const org = {
      slug: "acme-corp",
      legal_name: "ACME Corporation",
      bank_accounts: [
        {
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
        },
      ],
    };
    fetchSpy.mockReturnValue(jsonResponse({ organization: org }));

    const result = await getOrganization(client);

    expect(result).toEqual(org);
    expect(result.slug).toBe("acme-corp");
    expect(result.legal_name).toBe("ACME Corporation");
    expect(result.bank_accounts).toHaveLength(1);
  });

  it("calls the correct API endpoint", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        organization: { slug: "test", legal_name: "Test", bank_accounts: [] },
      }),
    );

    await getOrganization(client);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/organization");
  });
});
