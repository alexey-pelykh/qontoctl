// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  buildPaymentLinkQueryParams,
  listPaymentLinks,
  getPaymentLink,
  createPaymentLink,
  deactivatePaymentLink,
  listPaymentLinkPayments,
  listPaymentMethods,
  connectPaymentLinks,
  getConnectionStatus,
} from "./payment-links.js";

const paymentLink = {
  id: "pl-1",
  status: "active",
  expiration_date: "2026-12-31T23:59:59.000Z",
  potential_payment_methods: ["card", "transfer"],
  amount: { value: "100.00", currency: "EUR" },
  resource_type: "basket",
  items: [
    {
      title: "Widget",
      quantity: 2,
      unit_price: { value: "50.00", currency: "EUR" },
      vat_rate: "20.0",
    },
  ],
  reusable: false,
  invoice_id: null,
  invoice_number: null,
  debitor_name: null,
  created_at: "2026-01-01T00:00:00.000Z",
  url: "https://pay.qonto.com/pl-1",
};

describe("buildPaymentLinkQueryParams", () => {
  it("returns empty object when no params are set", () => {
    expect(buildPaymentLinkQueryParams({})).toEqual({});
  });

  it("converts page and per_page to strings", () => {
    const result = buildPaymentLinkQueryParams({ page: 2, per_page: 10 });
    expect(result).toEqual({ page: "2", per_page: "10" });
  });

  it("joins status array with commas", () => {
    const result = buildPaymentLinkQueryParams({ status: ["active", "inactive"] });
    expect(result).toEqual({ "status[]": "active,inactive" });
  });

  it("includes sort_by when provided", () => {
    const result = buildPaymentLinkQueryParams({ sort_by: "created_at:desc" });
    expect(result).toEqual({ sort_by: "created_at:desc" });
  });

  it("omits undefined params", () => {
    const result = buildPaymentLinkQueryParams({ page: 1 });
    expect(result).toEqual({ page: "1" });
    expect(result).not.toHaveProperty("per_page");
    expect(result).not.toHaveProperty("status[]");
    expect(result).not.toHaveProperty("sort_by");
  });

  it("omits status when array is empty", () => {
    const result = buildPaymentLinkQueryParams({ status: [] });
    expect(result).not.toHaveProperty("status[]");
  });
});

describe("listPaymentLinks", () => {
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

  it("returns payment links and meta from the API response", async () => {
    const meta = { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 };
    fetchSpy.mockReturnValue(jsonResponse({ payment_links: [paymentLink], meta }));

    const result = await listPaymentLinks(client);

    expect(result.payment_links).toHaveLength(1);
    expect(result.payment_links[0]?.id).toBe("pl-1");
    expect(result.meta).toEqual(meta);
  });

  it("calls the correct endpoint without params", async () => {
    const meta = { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 25 };
    fetchSpy.mockReturnValue(jsonResponse({ payment_links: [], meta }));

    await listPaymentLinks(client);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/payment_links");
    expect(url.search).toBe("");
  });

  it("passes filter and pagination params as query strings", async () => {
    const meta = { current_page: 2, next_page: null, prev_page: 1, total_pages: 2, total_count: 30, per_page: 10 };
    fetchSpy.mockReturnValue(jsonResponse({ payment_links: [], meta }));

    await listPaymentLinks(client, { page: 2, per_page: 10, status: ["active"], sort_by: "created_at:desc" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
    expect(url.searchParams.get("status[]")).toBe("active");
    expect(url.searchParams.get("sort_by")).toBe("created_at:desc");
  });
});

describe("getPaymentLink", () => {
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

  it("returns the payment link from the API response", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ payment_link: paymentLink }));

    const result = await getPaymentLink(client, "pl-1");

    expect(result).toEqual(paymentLink);
    expect(result.id).toBe("pl-1");
  });

  it("calls the correct endpoint with encoded ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ payment_link: paymentLink }));

    await getPaymentLink(client, "pl-1");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/payment_links/pl-1");
  });
});

describe("createPaymentLink", () => {
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

  it("posts basket params and returns the created payment link", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ payment_link: paymentLink }));

    const params = {
      potential_payment_methods: ["card"],
      items: [
        {
          title: "Widget",
          quantity: 2,
          unit_price: { value: "50.00", currency: "EUR" },
          vat_rate: "20.0",
        },
      ],
    };
    const result = await createPaymentLink(client, params);

    expect(result).toEqual(paymentLink);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/payment_links");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ payment_link: params });
  });

  it("posts invoice params and returns the created payment link", async () => {
    const invoicePaymentLink = {
      ...paymentLink,
      resource_type: "invoice",
      items: null,
      invoice_id: "inv-1",
      invoice_number: "INV-001",
      debitor_name: "Acme Corp",
    };
    fetchSpy.mockReturnValue(jsonResponse({ payment_link: invoicePaymentLink }));

    const params = {
      invoice_id: "inv-1",
      invoice_number: "INV-001",
      debitor_name: "Acme Corp",
      amount: { value: "100.00", currency: "EUR" },
      potential_payment_methods: ["transfer"],
    };
    const result = await createPaymentLink(client, params);

    expect(result).toEqual(invoicePaymentLink);

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ payment_link: params });
  });

  it("passes idempotency key in headers when provided", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ payment_link: paymentLink }));

    await createPaymentLink(
      client,
      { potential_payment_methods: ["card"], items: [] },
      { idempotencyKey: "idem-123" },
    );

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Qonto-Idempotency-Key"]).toBe("idem-123");
  });
});

describe("deactivatePaymentLink", () => {
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

  it("patches the deactivate endpoint and returns the payment link", async () => {
    const deactivated = { ...paymentLink, status: "inactive" };
    fetchSpy.mockReturnValue(jsonResponse({ payment_link: deactivated }));

    const result = await deactivatePaymentLink(client, "pl-1");

    expect(result).toEqual(deactivated);
    expect(result.status).toBe("inactive");

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/payment_links/pl-1/deactivate");
    expect(init.method).toBe("PATCH");
  });
});

describe("listPaymentLinkPayments", () => {
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

  const payment = {
    id: "pay-1",
    amount: { value: "100.00", currency: "EUR" },
    status: "completed",
    created_at: "2026-01-15T10:00:00.000Z",
    payment_method: "card",
    paid_at: "2026-01-15T10:05:00.000Z",
    debitor_email: "buyer@example.com",
  };

  it("returns payments and meta from the API response", async () => {
    const meta = { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 };
    fetchSpy.mockReturnValue(jsonResponse({ payments: [payment], meta }));

    const result = await listPaymentLinkPayments(client, "pl-1");

    expect(result.payments).toHaveLength(1);
    expect(result.payments[0]?.id).toBe("pay-1");
    expect(result.meta).toEqual(meta);
  });

  it("calls the correct endpoint without params", async () => {
    const meta = { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 25 };
    fetchSpy.mockReturnValue(jsonResponse({ payments: [], meta }));

    await listPaymentLinkPayments(client, "pl-1");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/payment_links/pl-1/payments");
    expect(url.search).toBe("");
  });

  it("passes pagination params as query strings", async () => {
    const meta = { current_page: 2, next_page: null, prev_page: 1, total_pages: 2, total_count: 30, per_page: 10 };
    fetchSpy.mockReturnValue(jsonResponse({ payments: [], meta }));

    await listPaymentLinkPayments(client, "pl-1", { page: 2, per_page: 10 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  it("omits undefined pagination params", async () => {
    const meta = { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 5 };
    fetchSpy.mockReturnValue(jsonResponse({ payments: [], meta }));

    await listPaymentLinkPayments(client, "pl-1", { per_page: 5 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.get("per_page")).toBe("5");
  });
});

describe("listPaymentMethods", () => {
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

  it("returns payment methods from the API response", async () => {
    const methods = [
      { name: "card", enabled: true },
      { name: "transfer", enabled: false },
    ];
    fetchSpy.mockReturnValue(jsonResponse({ payment_link_payment_methods: methods }));

    const result = await listPaymentMethods(client);

    expect(result.payment_link_payment_methods).toHaveLength(2);
    expect(result.payment_link_payment_methods[0]?.name).toBe("card");
    expect(result.payment_link_payment_methods[1]?.enabled).toBe(false);
  });

  it("calls the correct endpoint", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ payment_link_payment_methods: [] }));

    await listPaymentMethods(client);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/payment_links/payment_methods");
  });
});

describe("connectPaymentLinks", () => {
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

  const connection = {
    connection_location: "https://connect.qonto.com/xyz",
    status: "pending",
    bank_account_id: "acc-1",
  };

  it("posts connection params and returns connection details", async () => {
    fetchSpy.mockReturnValue(jsonResponse(connection));

    const params = {
      partner_callback_url: "https://partner.example.com/callback",
      user_bank_account_id: "acc-1",
      user_phone_number: "+33612345678",
      user_website_url: "https://shop.example.com",
    };
    const result = await connectPaymentLinks(client, params);

    expect(result).toEqual(connection);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/payment_links/connections");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual(params);
  });
});

describe("getConnectionStatus", () => {
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

  it("returns connection status from the API response", async () => {
    const connection = {
      connection_location: "https://connect.qonto.com/xyz",
      status: "active",
      bank_account_id: "acc-1",
    };
    fetchSpy.mockReturnValue(jsonResponse(connection));

    const result = await getConnectionStatus(client);

    expect(result).toEqual(connection);
    expect(result.status).toBe("active");
  });

  it("calls the correct endpoint", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        connection_location: "https://connect.qonto.com/xyz",
        status: "active",
        bank_account_id: "acc-1",
      }),
    );

    await getConnectionStatus(client);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/payment_links/connections");
  });
});
