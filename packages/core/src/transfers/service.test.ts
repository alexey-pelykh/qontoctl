// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { binaryResponse } from "../testing/binary-response.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  buildTransferQueryParams,
  getTransfer,
  createTransfer,
  cancelTransfer,
  getTransferProof,
  verifyPayee,
  bulkVerifyPayee,
} from "./service.js";
import type { ListTransfersParams } from "./types.js";

describe("buildTransferQueryParams", () => {
  it("returns empty object for empty params", () => {
    const result = buildTransferQueryParams({});
    expect(result).toEqual({});
  });

  it("maps status array with [] suffix", () => {
    const params: ListTransfersParams = {
      status: ["pending", "settled"],
    };
    const result = buildTransferQueryParams(params);
    expect(result).toEqual({
      "status[]": ["pending", "settled"],
    });
  });

  it("maps date range params", () => {
    const params: ListTransfersParams = {
      updated_at_from: "2025-01-01T00:00:00Z",
      updated_at_to: "2025-01-31T23:59:59Z",
      scheduled_date_from: "2025-01-01",
      scheduled_date_to: "2025-01-31",
    };
    const result = buildTransferQueryParams(params);
    expect(result).toEqual({
      updated_at_from: "2025-01-01T00:00:00Z",
      updated_at_to: "2025-01-31T23:59:59Z",
      scheduled_date_from: "2025-01-01",
      scheduled_date_to: "2025-01-31",
    });
  });

  it("maps array params with [] suffix", () => {
    const params: ListTransfersParams = {
      beneficiary_ids: ["ben-1", "ben-2"],
      ids: ["id-1"],
      recurring_transfer_ids: ["rec-1", "rec-2"],
    };
    const result = buildTransferQueryParams(params);
    expect(result).toEqual({
      "beneficiary_ids[]": ["ben-1", "ben-2"],
      "ids[]": ["id-1"],
      "recurring_transfer_ids[]": ["rec-1", "rec-2"],
    });
  });

  it("maps sort_by param", () => {
    const result = buildTransferQueryParams({ sort_by: "updated_at:desc" });
    expect(result).toEqual({ sort_by: "updated_at:desc" });
  });

  it("omits empty arrays", () => {
    const result = buildTransferQueryParams({
      status: [],
      beneficiary_ids: [],
      ids: [],
      recurring_transfer_ids: [],
    });
    expect(result).toEqual({});
  });
});

describe("getTransfer", () => {
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

  it("fetches a transfer by ID", async () => {
    const transfer = { id: "txfr-1", reference: "Invoice 001", amount: 100.5 };
    fetchSpy.mockReturnValue(jsonResponse({ transfer }));

    const result = await getTransfer(client, "txfr-1");
    expect(result).toEqual(transfer);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/txfr-1");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transfer: { id: "a/b" } }));

    await getTransfer(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/a%2Fb");
  });
});

describe("createTransfer", () => {
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

  it("posts to the correct endpoint and returns transfer", async () => {
    const transfer = { id: "txfr-new", beneficiary_id: "ben-1", amount: 500, status: "pending" };
    fetchSpy.mockReturnValue(jsonResponse({ transfer }));

    const result = await createTransfer(client, {
      beneficiary_id: "ben-1",
      debit_account_id: "acc-1",
      reference: "Test Payment",
      amount: 500,
      currency: "EUR",
    });
    expect(result).toEqual(transfer);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/transfers");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      beneficiary_id: "ben-1",
      debit_account_id: "acc-1",
      reference: "Test Payment",
      amount: 500,
      currency: "EUR",
    });
  });

  it("includes optional note and scheduled_date", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transfer: { id: "txfr-new" } }));

    await createTransfer(client, {
      beneficiary_id: "ben-1",
      debit_account_id: "acc-1",
      reference: "Scheduled",
      amount: 100,
      currency: "EUR",
      note: "Monthly payment",
      scheduled_date: "2026-04-01",
    });

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.note).toBe("Monthly payment");
    expect(body.scheduled_date).toBe("2026-04-01");
  });
});

describe("cancelTransfer", () => {
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

  it("posts to the cancel endpoint", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await cancelTransfer(client, "txfr-1");

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/transfers/txfr-1/cancel");
    expect(init.method).toBe("POST");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({}));

    await cancelTransfer(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/a%2Fb/cancel");
  });
});

describe("getTransferProof", () => {
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

  it("fetches proof as buffer from the correct endpoint", async () => {
    const pdfData = Buffer.from("%PDF-1.4 fake content");
    fetchSpy.mockReturnValue(binaryResponse(pdfData));

    const result = await getTransferProof(client, "txfr-1");
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe("%PDF-1.4 fake content");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/txfr-1/proof");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(binaryResponse(Buffer.from("data")));

    await getTransferProof(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/a%2Fb/proof");
  });
});

describe("verifyPayee", () => {
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

  it("posts to verify_payee endpoint and returns result", async () => {
    const verification = { iban: "FR7612345000010009876543210", name: "John Doe", result: "match" };
    fetchSpy.mockReturnValue(jsonResponse({ verification }));

    const result = await verifyPayee(client, {
      iban: "FR7612345000010009876543210",
      name: "John Doe",
    });
    expect(result).toEqual(verification);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/verify_payee");
    expect(init.method).toBe("POST");
  });
});

describe("bulkVerifyPayee", () => {
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

  it("posts entries to bulk_verify_payee endpoint and returns results", async () => {
    const verifications = [
      { iban: "FR7612345000010009876543210", name: "John Doe", result: "match" },
      { iban: "DE89370400440532013000", name: "Jane Smith", result: "mismatch" },
    ];
    fetchSpy.mockReturnValue(jsonResponse({ verifications }));

    const result = await bulkVerifyPayee(client, [
      { iban: "FR7612345000010009876543210", name: "John Doe" },
      { iban: "DE89370400440532013000", name: "Jane Smith" },
    ]);
    expect(result).toEqual(verifications);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/bulk_verify_payee");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      entries: [
        { iban: "FR7612345000010009876543210", name: "John Doe" },
        { iban: "DE89370400440532013000", name: "Jane Smith" },
      ],
    });
  });
});
