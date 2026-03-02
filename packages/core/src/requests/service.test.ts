// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  approveRequest,
  declineRequest,
  createFlashCardRequest,
  createVirtualCardRequest,
  createMultiTransferRequest,
} from "./service.js";

describe("approveRequest", () => {
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

  it("posts to the approve endpoint for a transfer request", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await approveRequest(client, "transfer", "req-1");

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/requests/transfers/req-1/approve");
    expect(init.method).toBe("POST");
  });

  it("posts to the approve endpoint for a multi_transfer request", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await approveRequest(client, "multi_transfer", "req-2");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/requests/multi_transfers/req-2/approve");
  });

  it("posts to the approve endpoint for a flash_card request", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await approveRequest(client, "flash_card", "req-3");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/requests/flash_cards/req-3/approve");
  });

  it("posts to the approve endpoint for a virtual_card request", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await approveRequest(client, "virtual_card", "req-4");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/requests/virtual_cards/req-4/approve");
  });

  it("sends debit_iban when provided", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await approveRequest(client, "transfer", "req-1", { debit_iban: "FR7612345000010009876543210" });

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ debit_iban: "FR7612345000010009876543210" });
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await approveRequest(client, "transfer", "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/requests/transfers/a%2Fb/approve");
  });
});

describe("declineRequest", () => {
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

  it("posts to the decline endpoint with declined_note", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await declineRequest(client, "transfer", "req-1", { declined_note: "Not approved" });

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/requests/transfers/req-1/decline");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ declined_note: "Not approved" });
  });

  it("posts to the correct endpoint for flash_card type", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await declineRequest(client, "flash_card", "req-2", { declined_note: "Denied" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/requests/flash_cards/req-2/decline");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await declineRequest(client, "transfer", "a/b", { declined_note: "No" });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/requests/transfers/a%2Fb/decline");
  });
});

describe("createFlashCardRequest", () => {
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

  it("posts to the flash_cards endpoint and returns the request", async () => {
    const request = {
      id: "req-1",
      request_type: "flash_card",
      status: "pending",
      initiator_id: "user-1",
      approver_id: null,
      note: "Travel expenses",
      declined_note: null,
      payment_lifespan_limit: "500.00",
      pre_expires_at: "2026-06-01T00:00:00.000Z",
      currency: "EUR",
      processed_at: null,
      created_at: "2026-03-01T10:00:00.000Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ request_flash_card: request }));

    const result = await createFlashCardRequest(client, {
      note: "Travel expenses",
      payment_lifespan_limit: "500.00",
      pre_expires_at: "2026-06-01T00:00:00.000Z",
    });
    expect(result).toEqual(request);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/requests/flash_cards");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      request_flash_card: {
        note: "Travel expenses",
        payment_lifespan_limit: "500.00",
        pre_expires_at: "2026-06-01T00:00:00.000Z",
      },
    });
  });

  it("sends empty params when no options provided", async () => {
    const request = {
      id: "req-2",
      request_type: "flash_card",
      status: "pending",
      initiator_id: "user-1",
      approver_id: null,
      note: "",
      declined_note: null,
      payment_lifespan_limit: "0.00",
      pre_expires_at: "2026-06-01T00:00:00.000Z",
      currency: "EUR",
      processed_at: null,
      created_at: "2026-03-01T10:00:00.000Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ request_flash_card: request }));

    await createFlashCardRequest(client, {});

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ request_flash_card: {} });
  });
});

describe("createVirtualCardRequest", () => {
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

  it("posts to the virtual_cards endpoint and returns the request", async () => {
    const request = {
      id: "req-1",
      request_type: "virtual_card",
      status: "pending",
      initiator_id: "user-1",
      approver_id: null,
      note: "Monthly subscription",
      declined_note: null,
      payment_monthly_limit: "200.00",
      currency: "EUR",
      processed_at: null,
      created_at: "2026-03-01T10:00:00.000Z",
      card_level: "virtual",
      card_design: "virtual.default.2017",
    };
    fetchSpy.mockReturnValue(jsonResponse({ request_virtual_card: request }));

    const result = await createVirtualCardRequest(client, {
      note: "Monthly subscription",
      payment_monthly_limit: "200.00",
      card_level: "virtual",
      card_design: "virtual.default.2017",
    });
    expect(result).toEqual(request);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/requests/virtual_cards");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      request_virtual_card: {
        note: "Monthly subscription",
        payment_monthly_limit: "200.00",
        card_level: "virtual",
        card_design: "virtual.default.2017",
      },
    });
  });
});

describe("createMultiTransferRequest", () => {
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

  it("posts to the multi_transfers endpoint and returns the request", async () => {
    const request = {
      id: "req-1",
      request_type: "multi_transfer",
      status: "pending",
      initiator_id: "user-1",
      approver_id: null,
      note: "Monthly payments",
      declined_note: null,
      total_transfers_amount: "300.00",
      total_transfers_amount_currency: "EUR",
      total_transfers_count: 2,
      scheduled_date: "2026-04-01",
      processed_at: null,
      created_at: "2026-03-01T10:00:00.000Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ request_multi_transfer: request }));

    const result = await createMultiTransferRequest(client, {
      note: "Monthly payments",
      transfers: [
        {
          amount: "150.00",
          currency: "EUR",
          credit_iban: "FR7612345000010009876543210",
          credit_account_name: "Vendor A",
          credit_account_currency: "EUR",
          reference: "Invoice 001",
        },
        {
          amount: "150.00",
          currency: "EUR",
          credit_iban: "DE89370400440532013000",
          credit_account_name: "Vendor B",
          credit_account_currency: "EUR",
          reference: "Invoice 002",
        },
      ],
      scheduled_date: "2026-04-01",
    });
    expect(result).toEqual(request);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/requests/multi_transfers");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      request_multi_transfer: {
        note: "Monthly payments",
        transfers: [
          {
            amount: "150.00",
            currency: "EUR",
            credit_iban: "FR7612345000010009876543210",
            credit_account_name: "Vendor A",
            credit_account_currency: "EUR",
            reference: "Invoice 001",
          },
          {
            amount: "150.00",
            currency: "EUR",
            credit_iban: "DE89370400440532013000",
            credit_account_name: "Vendor B",
            credit_account_currency: "EUR",
            reference: "Invoice 002",
          },
        ],
        scheduled_date: "2026-04-01",
      },
    });
  });

  it("includes optional debit_iban when provided", async () => {
    const request = {
      id: "req-2",
      request_type: "multi_transfer",
      status: "pending",
      initiator_id: "user-1",
      approver_id: null,
      note: "Payment",
      declined_note: null,
      total_transfers_amount: "100.00",
      total_transfers_amount_currency: "EUR",
      total_transfers_count: 1,
      scheduled_date: "2026-04-01",
      processed_at: null,
      created_at: "2026-03-01T10:00:00.000Z",
    };
    fetchSpy.mockReturnValue(jsonResponse({ request_multi_transfer: request }));

    await createMultiTransferRequest(client, {
      note: "Payment",
      transfers: [
        {
          amount: "100.00",
          currency: "EUR",
          credit_iban: "FR7612345000010009876543210",
          credit_account_name: "Vendor",
          credit_account_currency: "EUR",
          reference: "Inv 001",
        },
      ],
      debit_iban: "FR7630001007941234567890185",
    });

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const inner = body["request_multi_transfer"] as Record<string, unknown>;
    expect(inner["debit_iban"]).toBe("FR7630001007941234567890185");
  });
});
