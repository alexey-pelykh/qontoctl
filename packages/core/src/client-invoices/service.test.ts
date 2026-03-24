// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  buildClientInvoiceQueryParams,
  listClientInvoices,
  getClientInvoice,
  createClientInvoice,
  updateClientInvoice,
  deleteClientInvoice,
  finalizeClientInvoice,
  sendClientInvoice,
  markClientInvoicePaid,
  unmarkClientInvoicePaid,
  cancelClientInvoice,
  uploadClientInvoiceFile,
  getClientInvoiceUpload,
} from "./service.js";
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

const sampleInvoice = {
  id: "inv-1",
  organization_id: "org-1",
  invoice_number: "INV-001",
  status: "draft",
  client_id: "client-1",
  currency: "EUR",
  total_amount: { value: "100.00", currency: "EUR" },
  total_amount_cents: 10000,
  vat_amount: { value: "20.00", currency: "EUR" },
  vat_amount_cents: 2000,
  issue_date: "2026-01-15",
  due_date: "2026-02-15",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  attachment_id: null,
  contact_email: null,
  terms_and_conditions: null,
  header: null,
  footer: null,
  discount: null,
  items: [
    {
      title: "Service",
      description: null,
      quantity: "1",
      unit: null,
      vat_rate: "20.00",
      unit_price: { value: "100.00", currency: "EUR" },
      unit_price_cents: 10000,
      total_amount: { value: "120.00", currency: "EUR" },
      total_amount_cents: 12000,
      total_vat: { value: "20.00", currency: "EUR" },
      total_vat_cents: 2000,
      subtotal: { value: "100.00", currency: "EUR" },
      subtotal_cents: 10000,
      discount: null,
    },
  ],
  client: {
    id: "client-1",
    type: "company",
    name: "Acme Corp",
    first_name: null,
    last_name: null,
    email: "acme@example.com",
    vat_number: null,
    tax_identification_number: null,
    address: null,
    city: null,
    zip_code: null,
    country_code: null,
    locale: null,
    billing_address: null,
  },
};

const sampleUpload = {
  id: "upload-1",
  file_name: "invoice.pdf",
  file_size: 12345,
  file_content_type: "application/pdf",
  url: "https://example.com/invoice.pdf",
  created_at: "2026-01-01T00:00:00Z",
};

describe("listClientInvoices", () => {
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

  it("fetches client invoices list", async () => {
    const responseBody = {
      client_invoices: [sampleInvoice],
      meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 100 },
    };
    fetchSpy.mockReturnValue(jsonResponse(responseBody));

    const result = await listClientInvoices(client);

    expect(result).toEqual(responseBody);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices");
    expect(opts.method).toBe("GET");
  });

  it("passes filter and pagination params", async () => {
    const responseBody = {
      client_invoices: [sampleInvoice],
      meta: { current_page: 2, next_page: 3, prev_page: 1, total_pages: 3, total_count: 25, per_page: 10 },
    };
    fetchSpy.mockReturnValue(jsonResponse(responseBody));

    await listClientInvoices(client, { status: ["draft"], page: 2, per_page: 10 });

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices");
    expect(url.searchParams.getAll("filter[status]")).toEqual(["draft"]);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });
});

describe("getClientInvoice", () => {
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

  it("fetches a client invoice by ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    const result = await getClientInvoice(client, "inv-1");

    expect(result).toEqual(sampleInvoice);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices/inv-1");
    expect(opts.method).toBe("GET");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    await getClientInvoice(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices/a%2Fb");
  });
});

describe("createClientInvoice", () => {
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

  it("creates a client invoice via POST", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    const body = { client_invoice: { client_id: "client-1" } };
    const result = await createClientInvoice(client, body);

    expect(result).toEqual(sampleInvoice);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices");
    expect(opts.method).toBe("POST");
    const parsedBody = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(parsedBody).toEqual(body);
  });
});

describe("updateClientInvoice", () => {
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

  it("updates a client invoice via PATCH", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    const body = { client_invoice: { header: "Updated" } };
    const result = await updateClientInvoice(client, "inv-1", body);

    expect(result).toEqual(sampleInvoice);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices/inv-1");
    expect(opts.method).toBe("PATCH");
    const parsedBody = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(parsedBody).toEqual(body);
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    await updateClientInvoice(client, "a/b", {});

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices/a%2Fb");
  });
});

describe("deleteClientInvoice", () => {
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

  it("deletes a client invoice via DELETE", async () => {
    fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

    await deleteClientInvoice(client, "inv-1");

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices/inv-1");
    expect(opts.method).toBe("DELETE");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

    await deleteClientInvoice(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices/a%2Fb");
  });
});

describe("finalizeClientInvoice", () => {
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

  it("finalizes a client invoice via POST", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    const result = await finalizeClientInvoice(client, "inv-1");

    expect(result).toEqual(sampleInvoice);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices/inv-1/finalize");
    expect(opts.method).toBe("POST");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    await finalizeClientInvoice(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices/a%2Fb/finalize");
  });
});

describe("sendClientInvoice", () => {
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

  it("sends a client invoice via POST", async () => {
    fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

    await sendClientInvoice(client, "inv-1");

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices/inv-1/send");
    expect(opts.method).toBe("POST");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

    await sendClientInvoice(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices/a%2Fb/send");
  });
});

describe("markClientInvoicePaid", () => {
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

  it("marks a client invoice as paid via POST", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    const result = await markClientInvoicePaid(client, "inv-1");

    expect(result).toEqual(sampleInvoice);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices/inv-1/mark_as_paid");
    expect(opts.method).toBe("POST");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    await markClientInvoicePaid(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices/a%2Fb/mark_as_paid");
  });
});

describe("unmarkClientInvoicePaid", () => {
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

  it("unmarks a client invoice as paid via POST", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    const result = await unmarkClientInvoicePaid(client, "inv-1");

    expect(result).toEqual(sampleInvoice);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices/inv-1/unmark_as_paid");
    expect(opts.method).toBe("POST");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    await unmarkClientInvoicePaid(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices/a%2Fb/unmark_as_paid");
  });
});

describe("cancelClientInvoice", () => {
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

  it("cancels a client invoice via POST", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    const result = await cancelClientInvoice(client, "inv-1");

    expect(result).toEqual(sampleInvoice);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices/inv-1/mark_as_canceled");
    expect(opts.method).toBe("POST");
  });

  it("encodes special characters in the ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleInvoice }));

    await cancelClientInvoice(client, "a/b");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices/a%2Fb/mark_as_canceled");
  });
});

describe("uploadClientInvoiceFile", () => {
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

  it("uploads a file via multipart form-data and returns the upload", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ upload: sampleUpload }));

    const file = new Blob(["file content"], { type: "application/pdf" });
    const result = await uploadClientInvoiceFile(client, "inv-1", file, "invoice.pdf");

    expect(result).toEqual(sampleUpload);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices/inv-1/uploads");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBeInstanceOf(FormData);
  });

  it("encodes special characters in the invoice ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ upload: sampleUpload }));

    const file = new Blob(["file content"]);
    await uploadClientInvoiceFile(client, "a/b", file, "invoice.pdf");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices/a%2Fb/uploads");
  });
});

describe("getClientInvoiceUpload", () => {
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

  it("fetches upload details by invoice and upload IDs", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ upload: sampleUpload }));

    const result = await getClientInvoiceUpload(client, "inv-1", "upload-1");

    expect(result).toEqual(sampleUpload);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/client_invoices/inv-1/uploads/upload-1");
    expect(opts.method).toBe("GET");
  });

  it("encodes special characters in IDs", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ upload: sampleUpload }));

    await getClientInvoiceUpload(client, "a/b", "c/d");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/client_invoices/a%2Fb/uploads/c%2Fd");
  });
});
