// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  uploadAttachment,
  getAttachment,
  listTransactionAttachments,
  addTransactionAttachment,
  removeAllTransactionAttachments,
  removeTransactionAttachment,
} from "./service.js";

const sampleAttachment = {
  id: "att-1",
  file_name: "invoice.pdf",
  file_size: 12345,
  file_content_type: "application/pdf",
  url: "https://example.com/attachments/att-1",
  created_at: "2026-03-01T10:00:00Z",
};

describe("attachment service", () => {
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

  describe("uploadAttachment", () => {
    it("uploads a file via multipart form-data and returns the attachment", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ attachment: sampleAttachment }));

      const file = new Blob(["file content"], { type: "application/pdf" });
      const result = await uploadAttachment(client, file, "invoice.pdf");

      expect(result).toEqual(sampleAttachment);

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/attachments");
      expect(opts.method).toBe("POST");
      expect(opts.body).toBeInstanceOf(FormData);
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ attachment: sampleAttachment }));

      const file = new Blob(["file content"]);
      await uploadAttachment(client, file, "invoice.pdf", { idempotencyKey: "key-123" });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-123");
    });
  });

  describe("getAttachment", () => {
    it("fetches attachment details by ID", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ attachment: sampleAttachment }));

      const result = await getAttachment(client, "att-1");

      expect(result).toEqual(sampleAttachment);

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/attachments/att-1");
      expect(opts.method).toBe("GET");
    });
  });

  describe("listTransactionAttachments", () => {
    it("lists attachments for a transaction", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ attachments: [sampleAttachment] }));

      const result = await listTransactionAttachments(client, "tx-1");

      expect(result).toEqual([sampleAttachment]);

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/transactions/tx-1/attachments");
      expect(opts.method).toBe("GET");
    });
  });

  describe("addTransactionAttachment", () => {
    it("attaches a file to a transaction via multipart form-data", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ attachment: sampleAttachment }));

      const file = new Blob(["file content"]);
      const result = await addTransactionAttachment(client, "tx-1", file, "receipt.png");

      expect(result).toEqual(sampleAttachment);

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/transactions/tx-1/attachments");
      expect(opts.method).toBe("POST");
      expect(opts.body).toBeInstanceOf(FormData);
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ attachment: sampleAttachment }));

      const file = new Blob(["file content"]);
      await addTransactionAttachment(client, "tx-1", file, "receipt.png", { idempotencyKey: "key-456" });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-456");
    });
  });

  describe("removeAllTransactionAttachments", () => {
    it("removes all attachments from a transaction", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

      await removeAllTransactionAttachments(client, "tx-1");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/transactions/tx-1/attachments");
      expect(opts.method).toBe("DELETE");
    });
  });

  describe("removeTransactionAttachment", () => {
    it("removes a specific attachment from a transaction", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

      await removeTransactionAttachment(client, "tx-1", "att-1");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/transactions/tx-1/attachments/att-1");
      expect(opts.method).toBe("DELETE");
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

      await removeTransactionAttachment(client, "tx-1", "att-1", { idempotencyKey: "key-789" });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-789");
    });
  });
});
