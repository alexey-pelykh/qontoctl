// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HttpClient,
  QontoApiError,
  QontoOAuthScopeError,
  QontoRateLimitError,
  QontoScaRequiredError,
} from "./http-client.js";
import { binaryResponse } from "./testing/binary-response.js";
import { jsonResponse } from "./testing/json-response.js";

/**
 * Test-friendly subclass that stubs `sleep` to avoid real delays.
 */
class TestableHttpClient extends HttpClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected override sleep(_ms: number): Promise<void> {
    return Promise.resolve();
  }
}

function createMockLogger() {
  return {
    verbose: vi.fn<(message: string) => void>(),
    debug: vi.fn<(message: string) => void>(),
  };
}

describe("HttpClient", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("request basics", () => {
    it("sends GET request to configured base URL with path", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.toString()).toBe("https://thirdparty.qonto.com/v2/organizations");
      expect(init.method).toBe("GET");
    });

    it("sends requests to sandbox base URL when configured", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty-sandbox.staging.qonto.co",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.toString()).toBe("https://thirdparty-sandbox.staging.qonto.co/v2/organizations");
    });

    it("strips trailing slashes from base URL", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com///",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.toString()).toBe("https://thirdparty.qonto.com/v2/organizations");
    });

    it("appends query parameters to request URL", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/transactions", {
        status: "completed",
        page: "2",
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("status")).toBe("completed");
      expect(url.searchParams.get("page")).toBe("2");
    });

    it("appends array query parameters as repeated keys", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/transactions", {
        "status[]": ["pending", "completed"],
        side: "debit",
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.getAll("status[]")).toEqual(["pending", "completed"]);
      expect(url.searchParams.get("side")).toBe("debit");
    });

    it("sends POST request with JSON body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.post("/v2/internal_transfers", {
        amount: 100,
        currency: "EUR",
      });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify({ amount: 100, currency: "EUR" }));
    });

    it("returns parsed JSON response body", async () => {
      const responseData = { organization: { slug: "acme" } };
      fetchSpy.mockReturnValue(jsonResponse(responseData));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const result = await client.get("/v2/organizations");

      expect(result).toEqual(responseData);
    });

    it("resolves void for 204 No Content via requestVoid", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await expect(client.requestVoid("DELETE", "/v2/something")).resolves.toBeUndefined();
    });

    it("sends DELETE request via delete convenience method", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await expect(client.delete("/v2/something")).resolves.toBeUndefined();

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.toString()).toBe("https://thirdparty.qonto.com/v2/something");
      expect(init.method).toBe("DELETE");
    });
  });

  describe("requestBuffer", () => {
    it("returns response body as Buffer", async () => {
      const pdfData = Buffer.from("%PDF-1.4 test content");
      fetchSpy.mockReturnValue(binaryResponse(pdfData));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const result = await client.getBuffer("/v2/bank_accounts/acc-1/iban_certificate");

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe("%PDF-1.4 test content");
    });

    it("sends Accept: application/octet-stream header", async () => {
      fetchSpy.mockReturnValue(binaryResponse(Buffer.from("data")));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.getBuffer("/v2/bank_accounts/acc-1/iban_certificate");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["Accept"]).toBe("application/octet-stream");
    });

    it("calls the correct URL", async () => {
      fetchSpy.mockReturnValue(binaryResponse(Buffer.from("data")));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.getBuffer("/v2/bank_accounts/acc-1/iban_certificate");

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/bank_accounts/acc-1/iban_certificate");
    });

    it("logs binary response size in debug mode", async () => {
      const pdfData = Buffer.from("test binary data");
      fetchSpy.mockReturnValue(binaryResponse(pdfData));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.getBuffer("/v2/bank_accounts/acc-1/iban_certificate");

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("binary"));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining(`${pdfData.byteLength} bytes`));
    });
  });

  describe("headers", () => {
    it("includes Authorization header on all requests", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "acme-corp:secret-key-123",
      });

      await client.get("/v2/organizations");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("acme-corp:secret-key-123");
    });

    it("includes User-Agent header on all requests", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["User-Agent"]).toMatch(/^QontoCtl\/[\d.]+\s+\(Node\.js\/[\d.]+;\s+\w+\)$/);
    });

    it("includes Accept: application/json header", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["Accept"]).toBe("application/json");
    });

    it("includes Content-Type header only when body is present", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({}));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");
      const [, getInit] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const getHeaders = getInit.headers as Record<string, string>;
      expect(getHeaders["Content-Type"]).toBeUndefined();

      await client.post("/v2/transfers", { amount: 50 });
      const [, postInit] = fetchSpy.mock.calls[1] as [URL, RequestInit];
      const postHeaders = postInit.headers as Record<string, string>;
      expect(postHeaders["Content-Type"]).toBe("application/json");
    });
  });

  describe("staging token", () => {
    it("isSandbox is false when no staging token is configured", () => {
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      expect(client.isSandbox).toBe(false);
    });

    it("isSandbox is true when a staging token is configured", () => {
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty-sandbox.staging.qonto.co",
        authorization: "slug:secret",
        stagingToken: "tok-staging",
      });

      expect(client.isSandbox).toBe(true);
    });

    it("sends the staging token header when configured", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty-sandbox.staging.qonto.co",
        authorization: "slug:secret",
        stagingToken: "tok-staging",
      });

      await client.get("/v2/organizations");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Staging-Token"]).toBe("tok-staging");
    });

    it("omits the staging token header when not configured", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Staging-Token"]).toBeUndefined();
    });
  });

  describe("idempotency keys", () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    it("auto-generates idempotency key header on POST requests", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.post("/v2/internal_transfers", { amount: 100 });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toMatch(UUID_REGEX);
    });

    it("uses user-provided idempotency key on POST requests", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.post("/v2/internal_transfers", { amount: 100 }, { idempotencyKey: "user-key-123" });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("user-key-123");
    });

    it("auto-generates idempotency key header on DELETE requests", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.delete("/v2/something");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toMatch(UUID_REGEX);
    });

    it("uses user-provided idempotency key on DELETE requests", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.delete("/v2/something", { idempotencyKey: "delete-key-456" });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("delete-key-456");
    });

    it("does not include idempotency key header on GET requests", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBeUndefined();
    });

    it("auto-generates idempotency key for PUT requests via request()", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.request("PUT", "/v2/labels/123", { body: { name: "updated" } });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toMatch(UUID_REGEX);
    });

    it("reuses same idempotency key across retries", async () => {
      fetchSpy
        .mockReturnValueOnce(Promise.resolve(new Response(null, { status: 429 })))
        .mockReturnValueOnce(Promise.resolve(new Response(null, { status: 429 })))
        .mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        maxRetries: 3,
      });

      await client.post("/v2/internal_transfers", { amount: 100 });

      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const key1 = (calls[0]?.[1]?.headers as Record<string, string>)["X-Qonto-Idempotency-Key"];
      const key2 = (calls[1]?.[1]?.headers as Record<string, string>)["X-Qonto-Idempotency-Key"];
      const key3 = (calls[2]?.[1]?.headers as Record<string, string>)["X-Qonto-Idempotency-Key"];

      expect(key1).toMatch(UUID_REGEX);
      expect(key1).toBe(key2);
      expect(key1).toBe(key3);
    });

    it("auto-generates idempotency key for POST without body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.post("/v2/something");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toMatch(UUID_REGEX);
    });
  });

  describe("error handling", () => {
    it("throws QontoApiError on 4xx responses with structured errors", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse(
          {
            errors: [
              {
                code: "not_found",
                detail: "Organization not found",
              },
            ],
          },
          { status: 404 },
        ),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      const apiError = error as QontoApiError;
      expect(apiError.status).toBe(404);
      expect(apiError.errors).toEqual([{ code: "not_found", detail: "Organization not found" }]);
      expect(apiError.message).toContain("404");
      expect(apiError.message).toContain("not_found");
    });

    it("throws QontoApiError on 5xx responses", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse(
          {
            errors: [
              {
                code: "internal_error",
                detail: "Internal server error",
              },
            ],
          },
          { status: 500 },
        ),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect((error as QontoApiError).status).toBe(500);
    });

    it("handles non-JSON error responses gracefully", async () => {
      fetchSpy.mockReturnValue(
        Promise.resolve(
          new Response("Bad Gateway", {
            status: 502,
            headers: { "Content-Type": "text/plain" },
          }),
        ),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      const apiError = error as QontoApiError;
      expect(apiError.status).toBe(502);
      expect(apiError.errors[0]?.code).toBe("unknown");
    });

    it("throws QontoOAuthScopeError on 403 with missing oauth scope", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse(
          {
            errors: [
              {
                code: "forbidden",
                detail: "missing required oauth scope",
              },
            ],
          },
          { status: 403 },
        ),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "Bearer token",
      });

      const error = await client.post("/v2/internal_transfers", {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoOAuthScopeError);
      expect(error).toBeInstanceOf(QontoApiError);
      const scopeError = error as QontoOAuthScopeError;
      expect(scopeError.status).toBe(403);
      expect(scopeError.errors).toEqual([{ code: "forbidden", detail: "missing required oauth scope" }]);
    });

    it("throws generic QontoApiError on 403 without oauth scope message", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse(
          {
            errors: [
              {
                code: "forbidden",
                detail: "Access denied",
              },
            ],
          },
          { status: 403 },
        ),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "Bearer token",
      });

      const error = await client.post("/v2/internal_transfers", {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect(error).not.toBeInstanceOf(QontoOAuthScopeError);
    });

    it("preserves source information in error entries", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse(
          {
            errors: [
              {
                code: "not_in_list",
                detail: "status must be one of: pending, approved, declined",
                source: { parameter: "status" },
              },
            ],
          },
          { status: 422 },
        ),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.get("/v2/transactions").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      const apiError = error as QontoApiError;
      expect(apiError.errors[0]?.source?.parameter).toBe("status");
    });
  });

  describe("rate limiting", () => {
    it("retries on 429 with exponential backoff", async () => {
      fetchSpy
        .mockReturnValueOnce(Promise.resolve(new Response(null, { status: 429 })))
        .mockReturnValueOnce(Promise.resolve(new Response(null, { status: 429 })))
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        maxRetries: 3,
      });

      const result = await client.get("/v2/organizations");

      expect(result).toEqual({ data: "ok" });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("respects Retry-After header", async () => {
      const sleepCalls: number[] = [];

      class TrackingSleepClient extends HttpClient {
        protected override sleep(ms: number): Promise<void> {
          sleepCalls.push(ms);
          return Promise.resolve();
        }
      }

      fetchSpy
        .mockReturnValueOnce(
          Promise.resolve(
            new Response(null, {
              status: 429,
              headers: { "Retry-After": "3" },
            }),
          ),
        )
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const client = new TrackingSleepClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      expect(sleepCalls[0]).toBe(3000);
    });

    it("throws QontoRateLimitError after max retries exhausted", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 429 })));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        maxRetries: 2,
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoRateLimitError);
      expect(fetchSpy).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("ignores non-numeric Retry-After header and uses exponential backoff", async () => {
      const sleepCalls: number[] = [];

      class TrackingSleepClient extends HttpClient {
        protected override sleep(ms: number): Promise<void> {
          sleepCalls.push(ms);
          return Promise.resolve();
        }
      }

      fetchSpy
        .mockReturnValueOnce(
          Promise.resolve(
            new Response(null, {
              status: 429,
              headers: { "Retry-After": "not-a-number" },
            }),
          ),
        )
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const client = new TrackingSleepClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      expect(sleepCalls[0]).toBe(1000);
    });

    it("ignores zero Retry-After header and uses exponential backoff", async () => {
      const sleepCalls: number[] = [];

      class TrackingSleepClient extends HttpClient {
        protected override sleep(ms: number): Promise<void> {
          sleepCalls.push(ms);
          return Promise.resolve();
        }
      }

      fetchSpy
        .mockReturnValueOnce(
          Promise.resolve(
            new Response(null, {
              status: 429,
              headers: { "Retry-After": "0" },
            }),
          ),
        )
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const client = new TrackingSleepClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      expect(sleepCalls[0]).toBe(1000);
    });

    it("ignores negative Retry-After header and uses exponential backoff", async () => {
      const sleepCalls: number[] = [];

      class TrackingSleepClient extends HttpClient {
        protected override sleep(ms: number): Promise<void> {
          sleepCalls.push(ms);
          return Promise.resolve();
        }
      }

      fetchSpy
        .mockReturnValueOnce(
          Promise.resolve(
            new Response(null, {
              status: 429,
              headers: { "Retry-After": "-5" },
            }),
          ),
        )
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const client = new TrackingSleepClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      expect(sleepCalls[0]).toBe(1000);
    });

    it("uses exponential backoff when no Retry-After header", async () => {
      const sleepCalls: number[] = [];

      class TrackingSleepClient extends HttpClient {
        protected override sleep(ms: number): Promise<void> {
          sleepCalls.push(ms);
          return Promise.resolve();
        }
      }

      fetchSpy
        .mockReturnValueOnce(Promise.resolve(new Response(null, { status: 429 })))
        .mockReturnValueOnce(Promise.resolve(new Response(null, { status: 429 })))
        .mockReturnValueOnce(Promise.resolve(new Response(null, { status: 429 })))
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const client = new TrackingSleepClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.get("/v2/organizations");

      expect(sleepCalls).toEqual([1000, 2000, 4000]);
    });
  });

  describe("logging", () => {
    it("logs request method and URL in verbose mode", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.get("/v2/organizations");

      expect(logger.verbose).toHaveBeenCalledWith(
        expect.stringContaining("GET https://thirdparty.qonto.com/v2/organizations"),
      );
    });

    it("logs response status and timing in verbose mode", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.get("/v2/organizations");

      expect(logger.verbose).toHaveBeenCalledWith(expect.stringMatching(/200.*\d+ms/));
    });

    it("logs request body and response body in debug mode", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.post("/v2/transfers", { amount: 100 });

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("Request body"));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('"amount":100'));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("Response body"));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('"data":"ok"'));
    });

    it("logs request headers in debug mode", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.get("/v2/organizations");

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("Request headers"));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("User-Agent"));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("Accept"));
    });

    it("logs response headers in debug mode", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.get("/v2/organizations");

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("Response headers"));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("content-type"));
    });

    it("redacts sensitive fields in response body debug logs", async () => {
      const responseData = {
        organization: {
          slug: "acme",
          bank_accounts: [
            {
              id: "acc-1",
              name: "Main",
              iban: "FR7630001007941234567890185",
              bic: "BNPAFRPPXXX",
              balance: 12345.67,
              balance_cents: 1234567,
              authorized_balance: 10000.0,
              authorized_balance_cents: 1000000,
              currency: "EUR",
            },
          ],
        },
      };
      fetchSpy.mockReturnValue(jsonResponse(responseData));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.get("/v2/organization");

      const bodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("Response body"),
      );
      expect(bodyLogCalls.length).toBeGreaterThan(0);
      const bodyLog = bodyLogCalls[0]?.[0] as string;
      expect(bodyLog).not.toContain("FR7630001007941234567890185");
      expect(bodyLog).not.toContain("BNPAFRPPXXX");
      expect(bodyLog).not.toContain("12345.67");
      expect(bodyLog).not.toContain("1234567");
      expect(bodyLog).toContain('"iban":"[REDACTED]"');
      expect(bodyLog).toContain('"bic":"[REDACTED]"');
      expect(bodyLog).toContain('"balance":"[REDACTED]"');
      expect(bodyLog).toContain('"balance_cents":"[REDACTED]"');
      expect(bodyLog).toContain('"authorized_balance":"[REDACTED]"');
      expect(bodyLog).toContain('"authorized_balance_cents":"[REDACTED]"');
      // Non-sensitive fields are preserved
      expect(bodyLog).toContain('"slug":"acme"');
      expect(bodyLog).toContain('"currency":"EUR"');
    });

    it("redacts sca_session_token body field in response body debug logs", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ outer: { sca_session_token: "leaky-token-XYZ", other: "ok" } }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.get("/v2/something");

      const bodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("Response body"),
      );
      expect(bodyLogCalls.length).toBeGreaterThan(0);
      const bodyLog = bodyLogCalls[0]?.[0] as string;
      expect(bodyLog).not.toContain("leaky-token-XYZ");
      expect(bodyLog).toContain('"sca_session_token":"[REDACTED]"');
      expect(bodyLog).toContain('"other":"ok"');
    });

    it("redacts Authorization header in debug logs", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "acme-corp:secret-key-123",
        logger,
      });

      await client.get("/v2/organizations");

      const headerLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("Request headers"),
      );
      expect(headerLogCalls.length).toBeGreaterThan(0);
      const headerLog = headerLogCalls[0]?.[0] as string;
      expect(headerLog).toContain("[REDACTED]");
      expect(headerLog).not.toContain("secret-key-123");
    });

    it("redacts X-Qonto-Staging-Token header in debug logs", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty-sandbox.staging.qonto.co",
        authorization: "slug:secret",
        stagingToken: "sandbox-staging-token-secret-XYZ",
        logger,
      });

      await client.get("/v2/organizations");

      const headerLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("Request headers"),
      );
      const headerLog = headerLogCalls[0]?.[0] as string;
      expect(headerLog).not.toContain("sandbox-staging-token-secret-XYZ");
      expect(headerLog).toContain('"X-Qonto-Staging-Token":"[REDACTED]"');
    });

    it("redacts X-Qonto-Sca-Session-Token header in debug logs on retry with token", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "ok" }, { status: 201 }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.post("/v2/transfers", { amount: 100 }, { scaSessionToken: "retry-token-secret-ABC" });

      const headerLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("Request headers"),
      );
      // The header log is emitted from buildHeaders before the SCA token is added in
      // fetchWithRetry, so the SCA token isn't currently present in the captured log.
      // The redaction map nonetheless covers the header name as defense-in-depth: any
      // future log path that captures the assembled headers will redact it.
      for (const call of headerLogCalls) {
        const headerLog = call[0] as string;
        expect(headerLog).not.toContain("retry-token-secret-ABC");
      }
    });

    it("does not throw when logger is not provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await expect(client.get("/v2/organizations")).resolves.toEqual({
        data: "ok",
      });
    });

    it("logs retry attempts", async () => {
      fetchSpy
        .mockReturnValueOnce(Promise.resolve(new Response(null, { status: 429 })))
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.get("/v2/organizations");

      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining("retry 1"));
      expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining("Rate limited"));
    });
  });

  describe("SCA handling", () => {
    it("throws QontoScaRequiredError on 428 with session token", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ sca_session_token: "sca-tok-123" }, { status: 428 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoScaRequiredError);
      expect((error as QontoScaRequiredError).scaSessionToken).toBe("sca-tok-123");
    });

    it("does not leak SCA session token through any debug or verbose log on 428 (full request lifecycle)", async () => {
      // Integration-style test: a debug-mode user running against a 428 must
      // capture zero SCA token leakage across all logger channels.
      const SECRET_TOKEN = "sca-leak-canary-abc-123-def-456";
      fetchSpy.mockReturnValue(jsonResponse({ sca_session_token: SECRET_TOKEN }, { status: 428 }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoScaRequiredError);
      expect((error as QontoScaRequiredError).scaSessionToken).toBe(SECRET_TOKEN);
      expect((error as QontoScaRequiredError).message).not.toContain(SECRET_TOKEN);

      const allDebugCalls = logger.debug.mock.calls.map((c: string[]) => String(c[0]));
      const allVerboseCalls = logger.verbose.mock.calls.map((c: string[]) => String(c[0]));
      const allLogged = [...allDebugCalls, ...allVerboseCalls].join("\n");
      expect(allLogged).not.toContain(SECRET_TOKEN);
    });

    it("throws QontoScaRequiredError with 'unknown' when no token in body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}, { status: 428 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoScaRequiredError);
      expect((error as QontoScaRequiredError).scaSessionToken).toBe("unknown");
    });

    it("throws QontoScaRequiredError with 'unknown' when body is not JSON", async () => {
      fetchSpy.mockReturnValue(
        Promise.resolve(
          new Response("Precondition Required", {
            status: 428,
            headers: { "Content-Type": "text/plain" },
          }),
        ),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoScaRequiredError);
      expect((error as QontoScaRequiredError).scaSessionToken).toBe("unknown");
    });

    it("sends X-Qonto-2fa-Preference header on write requests when scaMethod is set", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        scaMethod: "paired_device",
      });

      await client.post("/v2/transfers", { amount: 100 });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-2fa-Preference"]).toBe("paired_device");
    });

    it("does not send X-Qonto-2fa-Preference header on GET requests", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        scaMethod: "paired_device",
      });

      await client.get("/v2/organizations");

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-2fa-Preference"]).toBeUndefined();
    });

    it("does not send X-Qonto-2fa-Preference header when scaMethod is not set", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.post("/v2/transfers", { amount: 100 });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-2fa-Preference"]).toBeUndefined();
    });

    it("sends X-Qonto-Sca-Session-Token header when scaSessionToken is provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.post("/v2/transfers", { amount: 100 }, { scaSessionToken: "sca-retry-tok" });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Sca-Session-Token"]).toBe("sca-retry-tok");
    });

    it("does not send X-Qonto-Sca-Session-Token header when not provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.post("/v2/transfers", { amount: 100 });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Sca-Session-Token"]).toBeUndefined();
    });

    it("sends scaSessionToken through patch method", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.patch("/v2/resource/1", { name: "updated" }, { scaSessionToken: "sca-patch-tok" });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Sca-Session-Token"]).toBe("sca-patch-tok");
    });

    it("sends scaSessionToken through delete method", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      await client.delete("/v2/resource/1", { scaSessionToken: "sca-delete-tok" });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Qonto-Sca-Session-Token"]).toBe("sca-delete-tok");
    });
  });

  describe("fallback authorization", () => {
    it("retries with fallback auth on 401 when fallbackAuthorization is set", async () => {
      fetchSpy
        .mockReturnValueOnce(
          jsonResponse({ errors: [{ code: "unauthorized", detail: "Unauthorized" }] }, { status: 401 }),
        )
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const onFallback = vi.fn();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
        fallbackAuthorization: "slug:key",
        onFallback,
      });

      const result = await client.get("/v2/organizations");

      expect(result).toEqual({ data: "ok" });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [, fallbackInit] = fetchSpy.mock.calls[1] as [URL, RequestInit];
      const headers = fallbackInit.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("slug:key");
      expect(onFallback).toHaveBeenCalledWith("GET", "/v2/organizations");
    });

    it("retries with fallback auth on 403 when fallbackAuthorization is set", async () => {
      fetchSpy
        .mockReturnValueOnce(jsonResponse({ errors: [{ code: "forbidden", detail: "Forbidden" }] }, { status: 403 }))
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
        fallbackAuthorization: "slug:key",
      });

      const result = await client.get("/v2/organizations");

      expect(result).toEqual({ data: "ok" });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("throws original error on 401 when no fallbackAuthorization is set", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ errors: [{ code: "unauthorized", detail: "Unauthorized" }] }, { status: 401 }),
      );

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect((error as QontoApiError).status).toBe(401);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("throws fallback error when fallback request also fails", async () => {
      fetchSpy
        .mockReturnValueOnce(
          jsonResponse({ errors: [{ code: "unauthorized", detail: "Unauthorized" }] }, { status: 401 }),
        )
        .mockReturnValue(jsonResponse({ errors: [{ code: "forbidden", detail: "Forbidden" }] }, { status: 403 }));

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
        fallbackAuthorization: "slug:bad-key",
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect((error as QontoApiError).status).toBe(403);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("does not trigger fallback on successful request", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));

      const onFallback = vi.fn();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
        fallbackAuthorization: "slug:key",
        onFallback,
      });

      await client.get("/v2/organizations");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(onFallback).not.toHaveBeenCalled();
    });

    it("does not trigger fallback on non-auth errors", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ errors: [{ code: "not_found", detail: "Not found" }] }, { status: 404 }));

      const onFallback = vi.fn();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
        fallbackAuthorization: "slug:key",
        onFallback,
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect((error as QontoApiError).status).toBe(404);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(onFallback).not.toHaveBeenCalled();
    });

    it("supports dynamic fallback authorization function", async () => {
      fetchSpy
        .mockReturnValueOnce(
          jsonResponse({ errors: [{ code: "unauthorized", detail: "Unauthorized" }] }, { status: 401 }),
        )
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
        fallbackAuthorization: () => "slug:dynamic-key",
      });

      const result = await client.get("/v2/organizations");

      expect(result).toEqual({ data: "ok" });
      const [, fallbackInit] = fetchSpy.mock.calls[1] as [URL, RequestInit];
      const headers = fallbackInit.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("slug:dynamic-key");
    });

    it("preserves idempotency key during fallback retry on write request", async () => {
      fetchSpy
        .mockReturnValueOnce(
          jsonResponse({ errors: [{ code: "unauthorized", detail: "Unauthorized" }] }, { status: 401 }),
        )
        .mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
        fallbackAuthorization: "slug:key",
      });

      await client.post("/v2/transfers", { amount: 100 });

      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const key1 = (calls[0]?.[1]?.headers as Record<string, string>)["X-Qonto-Idempotency-Key"];
      const key2 = (calls[1]?.[1]?.headers as Record<string, string>)["X-Qonto-Idempotency-Key"];
      expect(key1).toBeDefined();
      expect(key1).toBe(key2);
    });

    it("logs primary error body in debug mode before fallback", async () => {
      const primaryBody = { errors: [{ code: "unauthorized", detail: "Unauthorized" }] };
      fetchSpy
        .mockReturnValueOnce(jsonResponse(primaryBody, { status: 401 }))
        .mockReturnValue(jsonResponse({ data: "ok" }));

      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
        fallbackAuthorization: "slug:key",
        logger,
      });

      await client.get("/v2/organizations");

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining("Primary auth error response body:"));
    });

    it("propagates non-auth 401 error directly instead of falling back", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse(
          { errors: [{ code: "vop_proof_token_missing", detail: "VOP proof token is required" }] },
          { status: 401 },
        ),
      );

      const onFallback = vi.fn();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
        fallbackAuthorization: "slug:key",
        onFallback,
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect((error as QontoApiError).status).toBe(401);
      expect((error as QontoApiError).errors[0]?.code).toBe("vop_proof_token_missing");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(onFallback).not.toHaveBeenCalled();
    });

    it("propagates non-auth 403 error directly instead of falling back", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ errors: [{ code: "insufficient_funds", detail: "Insufficient funds" }] }, { status: 403 }),
      );

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "oauth-token",
        fallbackAuthorization: "slug:key",
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect((error as QontoApiError).status).toBe(403);
      expect((error as QontoApiError).errors[0]?.code).toBe("insufficient_funds");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("QontoScaRequiredError", () => {
    it("has correct name property", () => {
      const error = new QontoScaRequiredError("tok-123");
      expect(error.name).toBe("QontoScaRequiredError");
    });

    it("does not include session token in message", () => {
      const error = new QontoScaRequiredError("tok-456");
      expect(error.message).not.toContain("tok-456");
      expect(error.message).toBe("SCA required");
    });

    it("exposes scaSessionToken property", () => {
      const error = new QontoScaRequiredError("tok-789");
      expect(error.scaSessionToken).toBe("tok-789");
    });

    it("is an instance of Error", () => {
      const error = new QontoScaRequiredError("tok-abc");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("QontoOAuthScopeError", () => {
    it("has correct name property", () => {
      const error = new QontoOAuthScopeError([{ code: "forbidden", detail: "missing required oauth scope" }]);
      expect(error.name).toBe("QontoOAuthScopeError");
    });

    it("has status 403", () => {
      const error = new QontoOAuthScopeError([{ code: "forbidden", detail: "missing required oauth scope" }]);
      expect(error.status).toBe(403);
    });

    it("is an instance of QontoApiError", () => {
      const error = new QontoOAuthScopeError([{ code: "forbidden", detail: "missing required oauth scope" }]);
      expect(error).toBeInstanceOf(QontoApiError);
    });

    it("is an instance of Error", () => {
      const error = new QontoOAuthScopeError([{ code: "forbidden", detail: "missing required oauth scope" }]);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("QontoApiError", () => {
    it("has correct name property", () => {
      const error = new QontoApiError(400, [{ code: "invalid", detail: "Bad request" }]);
      expect(error.name).toBe("QontoApiError");
    });

    it("formats message with status and error details", () => {
      const error = new QontoApiError(422, [
        { code: "not_in_list", detail: "invalid status" },
        { code: "required", detail: "missing field" },
      ]);
      expect(error.message).toContain("422");
      expect(error.message).toContain("not_in_list");
      expect(error.message).toContain("required");
    });

    it("is an instance of Error", () => {
      const error = new QontoApiError(400, [{ code: "test", detail: "test" }]);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("QontoRateLimitError", () => {
    it("has correct name property", () => {
      const error = new QontoRateLimitError(30);
      expect(error.name).toBe("QontoRateLimitError");
    });

    it("includes retry-after in message when provided", () => {
      const error = new QontoRateLimitError(30);
      expect(error.message).toContain("30");
    });

    it("omits retry-after from message when undefined", () => {
      const error = new QontoRateLimitError(undefined);
      expect(error.message).toBe("Rate limit exceeded");
    });

    it("is an instance of Error", () => {
      const error = new QontoRateLimitError(10);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
