// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BankAccount, Organization } from "../api-types.js";
import { HttpClient } from "../http-client.js";
import { binaryResponse } from "../testing/binary-response.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  getBankAccount,
  getIbanCertificate,
  createBankAccount,
  updateBankAccount,
  listBankAccounts,
  closeBankAccount,
  resolveDefaultBankAccount,
} from "./bank-accounts.js";

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

describe("getIbanCertificate", () => {
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

  it("fetches IBAN certificate as buffer from the correct endpoint", async () => {
    const pdfData = Buffer.from("%PDF-1.4 iban cert");
    fetchSpy.mockReturnValue(binaryResponse(pdfData));

    const result = await getIbanCertificate(client, "acc-1");
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe("%PDF-1.4 iban cert");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/bank_accounts/acc-1/iban_certificate");
  });
});

describe("createBankAccount", () => {
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

  it("posts to the correct endpoint and returns bank account", async () => {
    const account = {
      id: "acc-new",
      name: "New Account",
      status: "active",
      main: false,
      organization_id: "org-1",
      iban: "FR7630006000011234567890189",
      bic: "BNPAFRPP",
      currency: "EUR",
      balance: 0,
      balance_cents: 0,
      authorized_balance: 0,
      authorized_balance_cents: 0,
      slug: "new-account",
    };
    fetchSpy.mockReturnValue(jsonResponse({ bank_account: account }));

    const result = await createBankAccount(client, { name: "New Account" });
    expect(result).toEqual(account);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/bank_accounts");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ bank_account: { name: "New Account" } });
  });
});

describe("updateBankAccount", () => {
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

  it("puts to the correct endpoint and returns updated bank account", async () => {
    const account = {
      id: "acc-1",
      name: "Renamed Account",
      status: "active",
      main: true,
      organization_id: "org-1",
      iban: "FR7630006000011234567890189",
      bic: "BNPAFRPP",
      currency: "EUR",
      balance: 10000,
      balance_cents: 1000000,
      authorized_balance: 9500,
      authorized_balance_cents: 950000,
      slug: "renamed-account",
    };
    fetchSpy.mockReturnValue(jsonResponse({ bank_account: account }));

    const result = await updateBankAccount(client, "acc-1", { name: "Renamed Account" });
    expect(result).toEqual(account);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/bank_accounts/acc-1");
    expect(init.method).toBe("PUT");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ bank_account: { name: "Renamed Account" } });
  });
});

describe("listBankAccounts", () => {
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

  it("lists bank accounts from the correct endpoint", async () => {
    const accounts = [
      {
        id: "acc-1",
        name: "Main",
        status: "active",
        main: true,
        organization_id: "org-1",
        iban: "FR76",
        bic: "BNPA",
        currency: "EUR",
        balance: 10000,
        balance_cents: 1000000,
        authorized_balance: 9500,
        authorized_balance_cents: 950000,
        slug: "main",
      },
    ];
    fetchSpy.mockReturnValue(jsonResponse({ bank_accounts: accounts }));

    const result = await listBankAccounts(client);
    expect(result.bank_accounts).toHaveLength(1);
    expect(result.bank_accounts[0]?.id).toBe("acc-1");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/bank_accounts");
    expect(url.search).toBe("");
  });

  it("passes pagination params as query strings", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ bank_accounts: [] }));

    await listBankAccounts(client, { page: 2, per_page: 10 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  it("omits undefined pagination params", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ bank_accounts: [] }));

    await listBankAccounts(client, { per_page: 5 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.get("per_page")).toBe("5");
  });
});

describe("closeBankAccount", () => {
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

  it("posts to the close endpoint", async () => {
    fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

    await closeBankAccount(client, "acc-1");

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/bank_accounts/acc-1/close");
    expect(init.method).toBe("POST");
  });
});

function makeAccount(overrides: Partial<BankAccount> & { id: string }): BankAccount {
  return {
    name: "Account",
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
    ...overrides,
  };
}

function makeOrg(accounts: BankAccount[]): Organization {
  return { slug: "acme", legal_name: "Acme Corp", bank_accounts: accounts };
}

describe("resolveDefaultBankAccount", () => {
  it("returns the main account when present", () => {
    const main = makeAccount({ id: "main-1", main: true });
    const other = makeAccount({ id: "other-1" });
    expect(resolveDefaultBankAccount(makeOrg([other, main]))).toBe(main);
  });

  it("falls back to the first account when no main account exists", () => {
    const first = makeAccount({ id: "first-1" });
    const second = makeAccount({ id: "second-1" });
    expect(resolveDefaultBankAccount(makeOrg([first, second]))).toBe(first);
  });

  it("returns undefined when there are no accounts", () => {
    expect(resolveDefaultBankAccount(makeOrg([]))).toBeUndefined();
  });
});
