// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient, QontoApiError } from "../http-client.js";
import { binaryResponse } from "../testing/binary-response.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  buildTransferQueryParams,
  listTransfers,
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

describe("listTransfers", () => {
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

  it("lists transfers without params", async () => {
    const body = {
      transfers: [
        {
          id: "txfr-1",
          initiator_id: "user-1",
          bank_account_id: "ba-1",
          beneficiary_id: "ben-1",
          amount: 100,
          amount_cents: 10000,
          amount_currency: "EUR",
          status: "pending",
          reference: "Ref",
          note: null,
          scheduled_date: "2025-03-01",
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
          processed_at: null,
          completed_at: null,
          transaction_id: null,
          recurring_transfer_id: null,
          declined_reason: null,
        },
      ],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    const result = await listTransfers(client);
    expect(result.transfers).toHaveLength(1);
    expect(result.meta.current_page).toBe(1);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers");
    expect(url.search).toBe("");
  });

  it("passes filter and pagination params as query strings", async () => {
    const body = {
      transfers: [],
      meta: { current_page: 2, next_page: null, prev_page: 1, total_pages: 2, total_count: 30, per_page: 10 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listTransfers(client, {
      status: ["pending"],
      current_page: 2,
      per_page: 10,
    });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.getAll("status[]")).toEqual(["pending"]);
    expect(url.searchParams.get("current_page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  it("omits undefined pagination params", async () => {
    const body = {
      transfers: [],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 0, per_page: 25 },
    };
    fetchSpy.mockReturnValue(jsonResponse(body));

    await listTransfers(client, { current_page: 3 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("current_page")).toBe("3");
    expect(url.searchParams.has("per_page")).toBe(false);
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

  const completeTransfer = {
    id: "txfr-1",
    initiator_id: "user-1",
    bank_account_id: "ba-1",
    beneficiary_id: "ben-1",
    amount: 100.5,
    amount_cents: 10050,
    amount_currency: "EUR",
    status: "pending",
    reference: "Invoice 001",
    note: null,
    scheduled_date: "2025-03-01",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    processed_at: null,
    completed_at: null,
    transaction_id: null,
    recurring_transfer_id: null,
    declined_reason: null,
  };

  it("fetches a transfer by ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transfer: completeTransfer }));

    const result = await getTransfer(client, "txfr-1");
    expect(result).toEqual(completeTransfer);

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/sepa/transfers/txfr-1");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transfer: { ...completeTransfer, id: "a/b" } }));

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

  const newTransfer = {
    id: "txfr-new",
    initiator_id: "user-1",
    bank_account_id: "acc-1",
    beneficiary_id: "ben-1",
    amount: 500,
    amount_cents: 50000,
    amount_currency: "EUR",
    status: "pending",
    reference: "Test Payment",
    note: null,
    scheduled_date: "2025-03-01",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    processed_at: null,
    completed_at: null,
    transaction_id: null,
    recurring_transfer_id: null,
    declined_reason: null,
  };

  it("posts to the correct endpoint and returns transfer", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transfer: newTransfer }));

    const result = await createTransfer(client, {
      beneficiary_id: "ben-1",
      bank_account_id: "acc-1",
      reference: "Test Payment",
      amount: "500",
      currency: "EUR",
      vop_proof_token: "tok_abc123",
    });
    expect(result).toEqual(newTransfer);

    const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/sepa/transfers");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      vop_proof_token: "tok_abc123",
      transfer: {
        beneficiary_id: "ben-1",
        bank_account_id: "acc-1",
        reference: "Test Payment",
        amount: "500",
        currency: "EUR",
      },
    });
  });

  it("includes optional note and scheduled_date", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ transfer: newTransfer }));

    await createTransfer(client, {
      beneficiary_id: "ben-1",
      bank_account_id: "acc-1",
      reference: "Scheduled",
      amount: "100",
      currency: "EUR",
      vop_proof_token: "tok_abc123",
      note: "Monthly payment",
      scheduled_date: "2026-04-01",
    });

    const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(init.body as string) as { transfer: Record<string, unknown> };
    expect(body.transfer.note).toBe("Monthly payment");
    expect(body.transfer.scheduled_date).toBe("2026-04-01");
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
    const verification = {
      iban: "FR7612345000010009876543210",
      name: "John Doe",
      result: "match",
      vop_proof_token: "tok_abc123",
    };
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

  const vopBankErrorCodes = [
    { status: 400, code: "BAD_REQUEST_ERROR_RESPONDING_BANK_NOT_AVAILABLE" },
    { status: 400, code: "BAD_REQUEST_ERROR_5XX_RESPONDING_BANK" },
    { status: 400, code: "BAD_REQUEST_ERROR_RESPONDING_BANK_INVALID_RESPONSE" },
    { status: 500, code: "INTERNAL_SERVER_ERROR_4XX_RESPONDING_BANK" },
    { status: 503, code: "BAD_GATEWAY_ERROR_RESPONDING_BANK" },
    { status: 503, code: "GATEWAY_TIMEOUT_ERROR_RESPONDING_BANK" },
  ];

  it.each(vopBankErrorCodes)("extracts proof token from $code ($status) error", async ({ status, code }) => {
    fetchSpy.mockImplementation(() =>
      jsonResponse(
        {
          errors: [
            {
              code,
              detail: "Bank error",
              meta: { proof_token: { token: "tok_from_error" } },
            },
          ],
        },
        { status },
      ),
    );

    const result = await verifyPayee(client, {
      iban: "FR7612345000010009876543210",
      name: "John Doe",
    });
    expect(result).toEqual({
      iban: "FR7612345000010009876543210",
      name: "John Doe",
      result: "not_available",
      vop_proof_token: "tok_from_error",
    });
  });

  const vopNonTokenErrorCodes = [
    { status: 400, code: "BAD_REQUEST_ERROR_UNSPECIFIED" },
    { status: 400, code: "BAD_REQUEST_ERROR_FORMAT" },
    { status: 500, code: "INTERNAL_SERVER_ERROR_UNSPECIFIED" },
    { status: 501, code: "NOT_IMPLEMENTED_ERROR_FEATURE_NOT_AVAILABLE" },
  ];

  it.each(vopNonTokenErrorCodes)(
    "re-throws $code ($status) error without token extraction",
    async ({ status, code }) => {
      fetchSpy.mockImplementation(() =>
        jsonResponse(
          {
            errors: [
              {
                code,
                detail: "Non-bank error",
              },
            ],
          },
          { status },
        ),
      );

      await expect(
        verifyPayee(client, {
          iban: "FR7612345000010009876543210",
          name: "John Doe",
        }),
      ).rejects.toThrow(QontoApiError);
    },
  );

  it("re-throws bank error when meta.proof_token.token is missing", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse(
        {
          errors: [
            {
              code: "BAD_GATEWAY_ERROR_RESPONDING_BANK",
              detail: "Bank error",
              meta: {},
            },
          ],
        },
        { status: 503 },
      ),
    );

    await expect(
      verifyPayee(client, {
        iban: "FR7612345000010009876543210",
        name: "John Doe",
      }),
    ).rejects.toThrow(QontoApiError);
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
      { iban: "FR7612345000010009876543210", name: "John Doe", result: "match", vop_proof_token: "tok_1" },
      { iban: "DE89370400440532013000", name: "Jane Smith", result: "mismatch", vop_proof_token: "tok_2" },
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

  it("extracts proof token from bank error and returns not_available for all entries", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse(
        {
          errors: [
            {
              code: "BAD_GATEWAY_ERROR_RESPONDING_BANK",
              detail: "Bank error",
              meta: { proof_token: { token: "tok_bulk_error" } },
            },
          ],
        },
        { status: 503 },
      ),
    );

    const result = await bulkVerifyPayee(client, [
      { iban: "FR7612345000010009876543210", name: "John Doe" },
      { iban: "DE89370400440532013000", name: "Jane Smith" },
    ]);
    expect(result).toEqual([
      {
        iban: "FR7612345000010009876543210",
        name: "John Doe",
        result: "not_available",
        vop_proof_token: "tok_bulk_error",
      },
      {
        iban: "DE89370400440532013000",
        name: "Jane Smith",
        result: "not_available",
        vop_proof_token: "tok_bulk_error",
      },
    ]);
  });

  it("re-throws non-bank errors", async () => {
    fetchSpy.mockImplementation(() =>
      jsonResponse(
        {
          errors: [{ code: "BAD_REQUEST_ERROR_UNSPECIFIED", detail: "Bad request" }],
        },
        { status: 400 },
      ),
    );

    await expect(bulkVerifyPayee(client, [{ iban: "FR7612345000010009876543210", name: "John Doe" }])).rejects.toThrow(
      QontoApiError,
    );
  });
});
