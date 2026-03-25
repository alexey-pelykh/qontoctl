// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  getInsuranceContract,
  createInsuranceContract,
  updateInsuranceContract,
  uploadInsuranceDocument,
  removeInsuranceDocument,
} from "./service.js";

const sampleContract = {
  id: "ic-1",
  insurance_type: "professional_liability",
  status: "active",
  provider_name: "AXA",
  contract_number: "CNT-12345",
  start_date: "2026-01-01",
  end_date: "2027-01-01",
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

const sampleDocument = {
  id: "doc-1",
  file_name: "policy.pdf",
  file_size: "54321",
  file_content_type: "application/pdf",
  url: "https://example.com/documents/doc-1",
  created_at: "2026-01-01T10:00:00Z",
};

describe("insurance contract service", () => {
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

  describe("getInsuranceContract", () => {
    it("fetches an insurance contract by ID", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      const result = await getInsuranceContract(client, "ic-1");

      expect(result).toEqual(sampleContract);

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-1");
      expect(opts.method).toBe("GET");
    });
  });

  describe("createInsuranceContract", () => {
    it("creates a new insurance contract", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      const result = await createInsuranceContract(client, {
        insurance_type: "professional_liability",
        provider_name: "AXA",
        start_date: "2026-01-01",
      });

      expect(result).toEqual(sampleContract);

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts");
      expect(opts.method).toBe("POST");

      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        insurance_contract: {
          insurance_type: "professional_liability",
          provider_name: "AXA",
          start_date: "2026-01-01",
        },
      });
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      await createInsuranceContract(
        client,
        { insurance_type: "health", provider_name: "MAIF", start_date: "2026-01-01" },
        { idempotencyKey: "key-123" },
      );

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-123");
    });
  });

  describe("updateInsuranceContract", () => {
    it("updates an existing insurance contract", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      const result = await updateInsuranceContract(client, "ic-1", {
        provider_name: "Allianz",
      });

      expect(result).toEqual(sampleContract);

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-1");
      expect(opts.method).toBe("PUT");

      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({ insurance_contract: { provider_name: "Allianz" } });
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_contract: sampleContract }));

      await updateInsuranceContract(client, "ic-1", { end_date: "2028-01-01" }, { idempotencyKey: "key-456" });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-456");
    });
  });

  describe("uploadInsuranceDocument", () => {
    it("uploads a document via multipart form-data", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_document: sampleDocument }));

      const file = new Blob(["file content"], { type: "application/pdf" });
      const result = await uploadInsuranceDocument(client, "ic-1", file, "policy.pdf");

      expect(result).toEqual(sampleDocument);

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-1/documents");
      expect(opts.method).toBe("POST");
      expect(opts.body).toBeInstanceOf(FormData);
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ insurance_document: sampleDocument }));

      const file = new Blob(["file content"]);
      await uploadInsuranceDocument(client, "ic-1", file, "policy.pdf", { idempotencyKey: "key-789" });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-789");
    });
  });

  describe("removeInsuranceDocument", () => {
    it("removes a document from an insurance contract", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

      await removeInsuranceDocument(client, "ic-1", "doc-1");

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/insurance_contracts/ic-1/documents/doc-1");
      expect(opts.method).toBe("DELETE");
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));

      await removeInsuranceDocument(client, "ic-1", "doc-1", { idempotencyKey: "key-abc" });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-abc");
    });
  });
});
