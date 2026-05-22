// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HttpClient,
  QontoApiError,
  QontoOAuthScopeError,
  QontoRateLimitError,
  QontoScaNotEnrolledError,
  QontoScaRequiredError,
} from "./http-client.js";
import { OAuthRefreshError } from "./auth/oauth-service.js";
import { AuthError } from "./auth/api-key.js";
import { OAuthNoTokenError } from "./auth/oauth.js";
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

    it("isMockSca is false when no staging token is configured", () => {
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        scaMethod: "mock",
      });

      // scaMethod can be set in production for explicit override, but isMockSca
      // requires sandbox routing — must not engage the sandbox-only mock SCA
      // path in production.
      expect(client.isMockSca).toBe(false);
    });

    it("isMockSca is false when staging token is set but scaMethod is not 'mock'", () => {
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty-sandbox.staging.qonto.co",
        authorization: "slug:secret",
        stagingToken: "tok-staging",
        scaMethod: "paired-device",
      });

      expect(client.isMockSca).toBe(false);
    });

    it("isMockSca is false when staging token is set but scaMethod is undefined", () => {
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty-sandbox.staging.qonto.co",
        authorization: "slug:secret",
        stagingToken: "tok-staging",
      });

      // Defensive: sandbox without an explicit scaMethod means the auto-default
      // hasn't been applied yet (`resolveScaMethod` is the resolver), so the
      // header-level flag is undefined and isMockSca is false.
      expect(client.isMockSca).toBe(false);
    });

    it("isMockSca is true when both staging token and scaMethod='mock' are configured", () => {
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty-sandbox.staging.qonto.co",
        authorization: "slug:secret",
        stagingToken: "tok-staging",
        scaMethod: "mock",
      });

      expect(client.isMockSca).toBe(true);
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
      fetchSpy.mockReturnValue(jsonResponse({ id: "tr-1", status: "completed" }));
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
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('"id":"tr-1"'));
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
      fetchSpy.mockReturnValue(jsonResponse({ outer: { sca_session_token: "leaky-token-XYZ", status: "ok" } }));
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
      expect(bodyLog).toContain('"status":"ok"');
    });

    it("redacts PII fields (send_to, email) in request body debug logs (#644)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.post("/v2/quotes/quote-1/send", {
        send_to: ["recipient-a@example.com", "recipient-b@example.com"],
        copy_to_self: true,
        email_title: "Your quote",
        email_body: "Body text",
      });

      const requestBodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].startsWith("Request body:"),
      );
      expect(requestBodyLogCalls.length).toBeGreaterThan(0);
      const bodyLog = requestBodyLogCalls[0]?.[0] as string;
      expect(bodyLog).not.toContain("recipient-a@example.com");
      expect(bodyLog).not.toContain("recipient-b@example.com");
      // The allowlist walk descends into the array and redacts each element
      // individually (the elements have no key to vouch for them).
      expect(bodyLog).toContain('"send_to":["[REDACTED]","[REDACTED]"]');
      // email_title is not provably never-PII (a subject line can carry a
      // recipient's name), so the allowlist redacts it; the copy_to_self
      // boolean flag is allowlisted and stays visible.
      expect(bodyLog).not.toContain("Your quote");
      expect(bodyLog).toContain('"email_title":"[REDACTED]"');
      expect(bodyLog).toContain('"copy_to_self":true');
    });

    it("redacts singular email field in request body debug logs (#644)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.post("/v2/beneficiaries", {
        name: "ACME Corp",
        iban: "FR7630001007941234567890185",
        email: "ops@acme.example",
      });

      const requestBodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].startsWith("Request body:"),
      );
      expect(requestBodyLogCalls.length).toBeGreaterThan(0);
      const bodyLog = requestBodyLogCalls[0]?.[0] as string;
      expect(bodyLog).not.toContain("ops@acme.example");
      expect(bodyLog).not.toContain("FR7630001007941234567890185");
      expect(bodyLog).toContain('"email":"[REDACTED]"');
      expect(bodyLog).toContain('"iban":"[REDACTED]"');
      expect(bodyLog).toContain('"name":"ACME Corp"');
    });

    it("redacts pre-existing sensitive fields (iban, bic, balance) in request body debug logs (#644)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.post("/v2/some-endpoint", {
        iban: "FR7630001007941234567890185",
        bic: "BNPAFRPPXXX",
        balance: 12345.67,
        status: "pending",
      });

      const requestBodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].startsWith("Request body:"),
      );
      const bodyLog = requestBodyLogCalls[0]?.[0] as string;
      expect(bodyLog).not.toContain("FR7630001007941234567890185");
      expect(bodyLog).not.toContain("BNPAFRPPXXX");
      expect(bodyLog).not.toContain("12345.67");
      expect(bodyLog).toContain('"iban":"[REDACTED]"');
      expect(bodyLog).toContain('"bic":"[REDACTED]"');
      expect(bodyLog).toContain('"balance":"[REDACTED]"');
      expect(bodyLog).toContain('"status":"pending"');
    });

    it("logs FormData request bodies as [FormData] placeholder (no JSON redaction needed)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "att-1" }, { status: 201 }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      const form = new FormData();
      form.append("file", new Blob(["binary"], { type: "application/pdf" }), "doc.pdf");
      await client.postFormData("/v2/attachments", form);

      const requestBodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].startsWith("Request body:"),
      );
      expect(requestBodyLogCalls.length).toBeGreaterThan(0);
      expect(requestBodyLogCalls[0]?.[0]).toBe("Request body: [FormData]");
    });

    it("redacts natural-person PII fields (first_name, last_name, tax_identification_number, phone_number) in request body debug logs (#647)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "client-1" }, { status: 201 }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.post("/v2/clients", {
        kind: "individual",
        first_name: "Jean",
        last_name: "Dupont",
        tax_identification_number: "FR12345678901",
        phone_number: "+33612345678",
        locale: "fr",
      });

      const requestBodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].startsWith("Request body:"),
      );
      expect(requestBodyLogCalls.length).toBeGreaterThan(0);
      const bodyLog = requestBodyLogCalls[0]?.[0] as string;
      expect(bodyLog).not.toContain("Jean");
      expect(bodyLog).not.toContain("Dupont");
      expect(bodyLog).not.toContain("FR12345678901");
      expect(bodyLog).not.toContain("+33612345678");
      expect(bodyLog).toContain('"first_name":"[REDACTED]"');
      expect(bodyLog).toContain('"last_name":"[REDACTED]"');
      expect(bodyLog).toContain('"tax_identification_number":"[REDACTED]"');
      expect(bodyLog).toContain('"phone_number":"[REDACTED]"');
      // Non-PII fields remain visible
      expect(bodyLog).toContain('"kind":"individual"');
      expect(bodyLog).toContain('"locale":"fr"');
    });

    it("redacts address components (address, street_address, city, zip_code, country_code, province_code) at top level and nested in request body debug logs (#647)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "client-1" }, { status: 201 }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.post("/v2/clients", {
        kind: "company",
        name: "ACME Corp",
        address: "10 Rue de Rivoli",
        city: "Paris",
        zip_code: "75001",
        country_code: "FR",
        province_code: "75",
        billing_address: {
          street_address: "20 Rue Saint-Honoré",
          city: "Paris",
          zip_code: "75008",
          country_code: "FR",
          province_code: "75",
        },
      });

      const requestBodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].startsWith("Request body:"),
      );
      expect(requestBodyLogCalls.length).toBeGreaterThan(0);
      const bodyLog = requestBodyLogCalls[0]?.[0] as string;
      expect(bodyLog).not.toContain("10 Rue de Rivoli");
      expect(bodyLog).not.toContain("20 Rue Saint-Honoré");
      expect(bodyLog).not.toContain("Paris");
      expect(bodyLog).not.toContain("75001");
      expect(bodyLog).not.toContain("75008");
      // Top-level address components redacted
      expect(bodyLog).toContain('"address":"[REDACTED]"');
      expect(bodyLog).toContain('"city":"[REDACTED]"');
      expect(bodyLog).toContain('"zip_code":"[REDACTED]"');
      expect(bodyLog).toContain('"country_code":"[REDACTED]"');
      expect(bodyLog).toContain('"province_code":"[REDACTED]"');
      // Nested address components inside billing_address redacted via recursive
      // walk — the walker always descends into objects so each child key is
      // judged independently against LOGGABLE_FIELDS.
      expect(bodyLog).toContain('"street_address":"[REDACTED]"');
      // Non-PII fields remain visible
      expect(bodyLog).toContain('"kind":"company"');
      expect(bodyLog).toContain('"name":"ACME Corp"');
    });

    it("preserves visible-by-design fields (name, vat_number) in request body debug logs to avoid over-redaction (#647)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "client-1" }, { status: 201 }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.post("/v2/clients", {
        kind: "company",
        name: "ACME Corp",
        vat_number: "FR12345678901",
        locale: "en",
      });

      const requestBodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].startsWith("Request body:"),
      );
      expect(requestBodyLogCalls.length).toBeGreaterThan(0);
      const bodyLog = requestBodyLogCalls[0]?.[0] as string;
      // Corporate name and vat_number are operational-debug fields, not PII;
      // they must NOT be redacted (judgment call documented at #647).
      expect(bodyLog).toContain('"name":"ACME Corp"');
      expect(bodyLog).toContain('"vat_number":"FR12345678901"');
      expect(bodyLog).toContain('"kind":"company"');
      expect(bodyLog).toContain('"locale":"en"');
    });

    it("redacts unknown and synonym field names by default — no allowlist edit required (#650)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "client-1" }, { status: 201 }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      // None of these key names are enumerated anywhere in the redaction
      // mechanism — they are synonyms / future-schema variants of fields the
      // old denylist covered by exact name. The allowlist model redacts them
      // anyway, simply because they are not marked safe-to-log. `date` IS
      // allowlisted, yet `date_of_birth` still redacts: matching is exact, not
      // prefix-based.
      await client.post("/v2/clients", {
        kind: "individual",
        email_address: "jean.dupont@example.com",
        tax_id: "FR99887766554",
        phone: "+33611223344",
        mobile: "+33655443322",
        national_id: "1840675120036",
        date_of_birth: "1984-06-15",
        metadata: { customer_email: "nested@example.com" },
      });

      const requestBodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].startsWith("Request body:"),
      );
      expect(requestBodyLogCalls.length).toBeGreaterThan(0);
      const bodyLog = requestBodyLogCalls[0]?.[0] as string;
      expect(bodyLog).not.toContain("jean.dupont@example.com");
      expect(bodyLog).not.toContain("FR99887766554");
      expect(bodyLog).not.toContain("+33611223344");
      expect(bodyLog).not.toContain("+33655443322");
      expect(bodyLog).not.toContain("1840675120036");
      expect(bodyLog).not.toContain("1984-06-15");
      expect(bodyLog).not.toContain("nested@example.com");
      expect(bodyLog).toContain('"email_address":"[REDACTED]"');
      expect(bodyLog).toContain('"tax_id":"[REDACTED]"');
      expect(bodyLog).toContain('"phone":"[REDACTED]"');
      expect(bodyLog).toContain('"mobile":"[REDACTED]"');
      expect(bodyLog).toContain('"national_id":"[REDACTED]"');
      expect(bodyLog).toContain('"date_of_birth":"[REDACTED]"');
      // Synonyms redact at depth too — the walk descends into nested objects.
      expect(bodyLog).toContain('"customer_email":"[REDACTED]"');
      // The allowlisted enum stays visible so the log is still useful.
      expect(bodyLog).toContain('"kind":"individual"');
    });

    it("keeps visible-by-design operational fields readable while redacting PII in the same object (#650)", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          id: "client-42",
          kind: "company",
          status: "active",
          name: "ACME Corp",
          vat_number: "FR12345678901",
          locale: "en",
          currency: "EUR",
          created_at: "2026-05-22T10:00:00Z",
          first_name: "Jean",
        }),
      );
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.get("/v2/clients/client-42");

      const bodyLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("Response body"),
      );
      expect(bodyLogCalls.length).toBeGreaterThan(0);
      const bodyLog = bodyLogCalls[0]?.[0] as string;
      // Operational fields the allowlist deliberately keeps visible so
      // catch-all redaction does not regress debug usefulness — IDs,
      // status/kind enums, money metadata, timestamps, and the #647
      // visible-by-design corporate name / vat_number carve-out.
      expect(bodyLog).toContain('"id":"client-42"');
      expect(bodyLog).toContain('"kind":"company"');
      expect(bodyLog).toContain('"status":"active"');
      expect(bodyLog).toContain('"name":"ACME Corp"');
      expect(bodyLog).toContain('"vat_number":"FR12345678901"');
      expect(bodyLog).toContain('"locale":"en"');
      expect(bodyLog).toContain('"currency":"EUR"');
      expect(bodyLog).toContain('"created_at":"2026-05-22T10:00:00Z"');
      // ...but a natural-person field sitting in the same object still redacts.
      expect(bodyLog).not.toContain("Jean");
      expect(bodyLog).toContain('"first_name":"[REDACTED]"');
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
      expect(headerLogCalls.length).toBeGreaterThan(0);
      const headerLog = headerLogCalls[0]?.[0] as string;
      expect(headerLog).not.toContain("retry-token-secret-ABC");
      expect(headerLog).toContain('"X-Qonto-Sca-Session-Token":"[REDACTED]"');
    });

    it("includes X-Qonto-2fa-Preference in Request headers debug log on writes when scaMethod is set (#576)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        scaMethod: "paired-device",
        logger,
      });

      await client.post("/v2/transfers", { amount: 100 });

      const headerLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("Request headers"),
      );
      expect(headerLogCalls.length).toBeGreaterThan(0);
      const headerLog = headerLogCalls[0]?.[0] as string;
      expect(headerLog).toContain('"X-Qonto-2fa-Preference":"paired-device"');
    });

    it("includes X-Qonto-Idempotency-Key in Request headers debug log on writes (#576)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        logger,
      });

      await client.post("/v2/transfers", { amount: 100 }, { idempotencyKey: "00000000-0000-0000-0000-000000000001" });

      const headerLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("Request headers"),
      );
      expect(headerLogCalls.length).toBeGreaterThan(0);
      const headerLog = headerLogCalls[0]?.[0] as string;
      expect(headerLog).toContain('"X-Qonto-Idempotency-Key":"00000000-0000-0000-0000-000000000001"');
    });

    it("does not include X-Qonto-2fa-Preference in Request headers debug log on GETs (#576)", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));
      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
        scaMethod: "paired-device",
        logger,
      });

      await client.get("/v2/organizations");

      const headerLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("Request headers"),
      );
      expect(headerLogCalls.length).toBeGreaterThan(0);
      const headerLog = headerLogCalls[0]?.[0] as string;
      expect(headerLog).not.toContain("X-Qonto-2fa-Preference");
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

    it("throws generic QontoApiError when 428 body has neither sca_session_token nor sca_not_enrolled", async () => {
      // Defensive: a 428 shape we have not seen before (no token, no
      // sca_not_enrolled code) must NOT fabricate a fake session token.
      // Surface a typed QontoApiError so callers do not retry with
      // X-Qonto-Sca-Session-Token: "unknown" (which Qonto rejects with a
      // confusing follow-up error).
      fetchSpy.mockReturnValue(jsonResponse({}, { status: 428 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect(error).not.toBeInstanceOf(QontoScaRequiredError);
      expect(error).not.toBeInstanceOf(QontoScaNotEnrolledError);
      expect((error as QontoApiError).status).toBe(428);
      expect((error as QontoApiError).errors).toEqual([{ code: "unknown", detail: "Unknown error" }]);
    });

    it("preserves JSON:API errors[] code/detail on unknown 428 shape", async () => {
      // When the 428 body carries a JSON:API errors[] envelope without a
      // recognized SCA code, the original code/detail must be propagated to
      // the caller (not collapsed into a sentinel "unknown" token).
      fetchSpy.mockReturnValue(
        jsonResponse(
          {
            errors: [{ code: "future_sca_variant", detail: "A new 428 shape we don't yet recognize" }],
          },
          { status: 428 },
        ),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect(error).not.toBeInstanceOf(QontoScaRequiredError);
      expect(error).not.toBeInstanceOf(QontoScaNotEnrolledError);
      expect((error as QontoApiError).status).toBe(428);
      expect((error as QontoApiError).errors).toEqual([
        { code: "future_sca_variant", detail: "A new 428 shape we don't yet recognize" },
      ]);
    });

    it("throws QontoScaNotEnrolledError on 428 with flat sca_not_enrolled body", async () => {
      // Real Qonto shape (from docs/security/sca-token-binding.md):
      // 428 { code: "sca_not_enrolled", message: "...", trace_id: "..." }
      fetchSpy.mockReturnValue(
        jsonResponse(
          {
            code: "sca_not_enrolled",
            message: "You must enable SCA to perform this action",
            trace_id: "trace-abc",
          },
          { status: 428 },
        ),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoScaNotEnrolledError);
      expect(error).toBeInstanceOf(QontoApiError);
      expect(error).not.toBeInstanceOf(QontoScaRequiredError);
      const enrolledError = error as QontoScaNotEnrolledError;
      expect(enrolledError.status).toBe(428);
      expect(enrolledError.errors).toEqual([
        { code: "sca_not_enrolled", detail: "You must enable SCA to perform this action" },
      ]);
    });

    it("throws QontoScaNotEnrolledError on 428 with JSON:API errors[] sca_not_enrolled entry", async () => {
      // Defensive: Qonto could ever return the JSON:API errors[] shape.
      fetchSpy.mockReturnValue(
        jsonResponse(
          {
            errors: [
              {
                code: "sca_not_enrolled",
                detail: "You must enable SCA to perform this action",
              },
            ],
          },
          { status: 428 },
        ),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoScaNotEnrolledError);
      expect((error as QontoScaNotEnrolledError).errors[0]?.code).toBe("sca_not_enrolled");
    });

    it("falls back to default message when sca_not_enrolled body has no message field", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ code: "sca_not_enrolled" }, { status: 428 }));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoScaNotEnrolledError);
      expect((error as QontoScaNotEnrolledError).errors[0]?.detail).toBe("SCA not enrolled");
    });

    it("prefers sca_session_token over code when both are present", async () => {
      // Defensive: if a future Qonto response carries both fields, prefer the
      // recoverable interpretation rather than the configuration-error one.
      fetchSpy.mockReturnValue(
        jsonResponse({ sca_session_token: "tok-mixed", code: "sca_not_enrolled" }, { status: 428 }),
      );
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const error = await client.post("/v2/transfers", { amount: 100 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoScaRequiredError);
      expect(error).not.toBeInstanceOf(QontoScaNotEnrolledError);
      expect((error as QontoScaRequiredError).scaSessionToken).toBe("tok-mixed");
    });

    it("throws generic QontoApiError when 428 body is not JSON", async () => {
      // Non-JSON 428 (e.g., plaintext from an upstream proxy) must surface as
      // a typed QontoApiError, not a fabricated QontoScaRequiredError("unknown")
      // that callers would re-send to Qonto on retry.
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

      expect(error).toBeInstanceOf(QontoApiError);
      expect(error).not.toBeInstanceOf(QontoScaRequiredError);
      expect(error).not.toBeInstanceOf(QontoScaNotEnrolledError);
      expect((error as QontoApiError).status).toBe(428);
      expect((error as QontoApiError).errors).toEqual([{ code: "unknown", detail: "Unknown error" }]);
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

    it("preserves X-Qonto-2fa-Preference during fallback retry on write request and logs it (#576)", async () => {
      fetchSpy
        .mockReturnValueOnce(
          jsonResponse({ errors: [{ code: "unauthorized", detail: "Unauthorized" }] }, { status: 401 }),
        )
        .mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));

      const logger = createMockLogger();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        // Function form mirrors the real OAuth bearer source (auto-refresh
        // resolves it lazily). Exercising the function branch in `buildHeaders`
        // alongside the string fallback gives this test coverage over the
        // OAuth-routed path.
        authorization: () => "Bearer oauth-token",
        fallbackAuthorization: "slug:key",
        scaMethod: "passkey",
        logger,
      });

      await client.post("/v2/transfers", { amount: 100 });

      // Transport: both attempts carry the SCA preference header.
      const calls = fetchSpy.mock.calls as [URL, RequestInit][];
      const primary = (calls[0]?.[1]?.headers as Record<string, string>)["X-Qonto-2fa-Preference"];
      const fallback = (calls[1]?.[1]?.headers as Record<string, string>)["X-Qonto-2fa-Preference"];
      expect(primary).toBe("passkey");
      expect(fallback).toBe("passkey");

      // Debug log: the SCA preference appears in BOTH Request headers entries
      // (initial + fallback). Pre-#576 the log was emitted from buildHeaders
      // before the per-request headers were added, so it was absent.
      const headerLogCalls = logger.debug.mock.calls.filter(
        (call: string[]) => typeof call[0] === "string" && call[0].includes("Request headers"),
      );
      expect(headerLogCalls.length).toBe(2);
      expect(headerLogCalls[0]?.[0] as string).toContain('"X-Qonto-2fa-Preference":"passkey"');
      expect(headerLogCalls[1]?.[0] as string).toContain('"X-Qonto-2fa-Preference":"passkey"');
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

    // ---------------------------------------------------------------------
    // Auth-flow fallback (OAuthRefreshError) — closes the gap from #523:
    // before this branch, an OAuth refresh failure (e.g., refresh-token
    // `invalid_grant`) propagated out of the request entirely, never
    // advancing to the fallback authorization. Now the typed
    // `OAuthRefreshError` is caught pre-fetch and the request is dispatched
    // with the fallback credential, mirroring the HTTP-401 fallback shape.
    // ---------------------------------------------------------------------

    it("falls back to api-key when OAuth auth callback throws OAuthRefreshError pre-fetch", async () => {
      const oauthAuth = vi.fn(() => {
        throw new OAuthRefreshError("OAuth token refresh failed: invalid_grant", new Error("invalid_grant"));
      });
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));

      const onFallback = vi.fn();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: oauthAuth,
        fallbackAuthorization: "slug:key",
        onFallback,
      });

      const result = await client.get("/v2/organizations");

      expect(result).toEqual({ data: "ok" });
      // Critical: the request was dispatched ONCE — directly with fallback —
      // not (failed primary then fallback retry). The OAuth attempt never
      // reached the network because the auth callback threw.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect((init.headers as Record<string, string>)["Authorization"]).toBe("slug:key");
      expect(onFallback).toHaveBeenCalledWith("GET", "/v2/organizations");
    });

    it("propagates OAuthRefreshError when no fallback is configured", async () => {
      const oauthAuth = vi.fn(() => {
        throw new OAuthRefreshError("OAuth token refresh failed: invalid_grant", new Error("invalid_grant"));
      });

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: oauthAuth,
        // No fallbackAuthorization — chain has nowhere to advance.
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OAuthRefreshError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("propagates non-OAuthRefreshError AuthError without falling back (do not mask config bugs)", async () => {
      // A non-typed AuthError (e.g., misconfigured api-key with empty secret)
      // is a configuration problem, NOT a refresh-flow failure. Falling back
      // would silently mask it. Verify we propagate.
      const auth = vi.fn(() => {
        throw new AuthError("Missing secret key in API key credentials");
      });

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: auth,
        fallbackAuthorization: "slug:key",
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AuthError);
      expect(error).not.toBeInstanceOf(OAuthRefreshError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("does NOT trigger HTTP 401 fallback when already on fallback after OAuthRefreshError", async () => {
      // Edge case: OAuthRefreshError pre-fetch → fallback dispatched → API
      // returns 401 (e.g., the api-key creds are also invalid). The 401
      // fallback path must NOT re-trigger (which would dispatch the same
      // fallback creds a third time and confuse the error class). The test
      // asserts: fetch called ONCE with fallback, then 401 propagates as
      // QontoApiError (not retried, not fallback-of-fallback'd).
      const oauthAuth = vi.fn(() => {
        throw new OAuthRefreshError("OAuth token refresh failed: invalid_grant", new Error("invalid_grant"));
      });
      fetchSpy.mockReturnValue(
        jsonResponse({ errors: [{ code: "unauthorized", detail: "Unauthorized" }] }, { status: 401 }),
      );

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: oauthAuth,
        fallbackAuthorization: "slug:bad-key",
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect((error as QontoApiError).status).toBe(401);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("preserves idempotency key on auth-flow fallback for write requests", async () => {
      const oauthAuth = vi.fn(() => {
        throw new OAuthRefreshError("OAuth token refresh failed: invalid_grant", new Error("invalid_grant"));
      });
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: oauthAuth,
        fallbackAuthorization: "slug:key",
      });

      await client.post("/v2/transfers", { amount: 100 });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      // Idempotency key was generated up-front in fetchWithRetry and applied
      // to the (single) fallback request — without this, the fallback would
      // miss the safety net for retried writes.
      expect(headers["X-Qonto-Idempotency-Key"]).toBeDefined();
    });

    // ---------------------------------------------------------------------
    // Auth-flow fallback (OAuthNoTokenError) — closes arm 1 of #631:
    // before this branch, an OAuth-credentials-configured-but-no-token
    // case threw a plain AuthError that propagated fatally even when the
    // user had wired api-key as the oauth-first fallback. Now the typed
    // OAuthNoTokenError is caught pre-fetch alongside OAuthRefreshError
    // and the request is dispatched with the fallback credential.
    //
    // The pattern mirrors the OAuthRefreshError tests above — same
    // structure, same expectations — because the fallback semantics are
    // identical; the discriminator is just which typed class triggered.
    // ---------------------------------------------------------------------

    it("falls back to api-key when OAuth auth callback throws OAuthNoTokenError pre-fetch (AC-1)", async () => {
      const oauthAuth = vi.fn(() => {
        throw new OAuthNoTokenError('No OAuth access token available. Run "qontoctl auth login" first.');
      });
      fetchSpy.mockReturnValue(jsonResponse({ data: "ok" }));

      const onFallback = vi.fn();
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: oauthAuth,
        fallbackAuthorization: "slug:key",
        onFallback,
      });

      const result = await client.get("/v2/organizations");

      expect(result).toEqual({ data: "ok" });
      // Critical: the request was dispatched ONCE — directly with fallback —
      // not (failed primary then fallback retry). The OAuth attempt never
      // reached the network because the auth callback threw.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect((init.headers as Record<string, string>)["Authorization"]).toBe("slug:key");
      // AC-6: onFallback is called with method + path, giving the wiring
      // for the stderr warning the CLI layer emits.
      expect(onFallback).toHaveBeenCalledWith("GET", "/v2/organizations");
    });

    it("propagates OAuthNoTokenError when no fallback is configured (AC-2 invariant: oauth bare-mode)", async () => {
      const oauthAuth = vi.fn(() => {
        throw new OAuthNoTokenError('No OAuth access token available. Run "qontoctl auth login" first.');
      });

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: oauthAuth,
        // No fallbackAuthorization — `oauth` bare-mode wires none even when
        // api-key creds exist. This is the security-architect invariant
        // that `oauth` bare-mode must fail loud rather than silently
        // degrade to api-key.
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OAuthNoTokenError);
      // Subclass relationship preserved — generic AuthError catch sites
      // still match (e.g., MCP error handler in earlier package versions).
      expect(error).toBeInstanceOf(AuthError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("does NOT trigger HTTP 401 fallback when already on fallback after OAuthNoTokenError", async () => {
      // Edge case parity with OAuthRefreshError: OAuthNoTokenError pre-fetch
      // → fallback dispatched → API returns 401 (e.g., the api-key creds
      // are also invalid). The 401 fallback path must NOT re-trigger
      // (which would dispatch the same fallback creds a third time and
      // confuse the error class).
      const oauthAuth = vi.fn(() => {
        throw new OAuthNoTokenError('No OAuth access token available. Run "qontoctl auth login" first.');
      });
      fetchSpy.mockReturnValue(
        jsonResponse({ errors: [{ code: "unauthorized", detail: "Unauthorized" }] }, { status: 401 }),
      );

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: oauthAuth,
        fallbackAuthorization: "slug:bad-key",
      });

      const error = await client.get("/v2/organizations").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(QontoApiError);
      expect((error as QontoApiError).status).toBe(401);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("preserves idempotency key on auth-flow fallback for write requests (OAuthNoTokenError path)", async () => {
      const oauthAuth = vi.fn(() => {
        throw new OAuthNoTokenError('No OAuth access token available. Run "qontoctl auth login" first.');
      });
      fetchSpy.mockReturnValue(jsonResponse({ id: "123" }, { status: 201 }));

      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: oauthAuth,
        fallbackAuthorization: "slug:key",
      });

      await client.post("/v2/transfers", { amount: 100 });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = init.headers as Record<string, string>;
      // Parity with OAuthRefreshError test: idempotency key must be
      // applied to the fallback dispatch.
      expect(headers["X-Qonto-Idempotency-Key"]).toBeDefined();
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

  describe("QontoScaNotEnrolledError", () => {
    it("has correct name property", () => {
      const error = new QontoScaNotEnrolledError([{ code: "sca_not_enrolled", detail: "..." }]);
      expect(error.name).toBe("QontoScaNotEnrolledError");
    });

    it("has status 428", () => {
      const error = new QontoScaNotEnrolledError([{ code: "sca_not_enrolled", detail: "..." }]);
      expect(error.status).toBe(428);
    });

    it("is an instance of QontoApiError", () => {
      const error = new QontoScaNotEnrolledError([{ code: "sca_not_enrolled", detail: "..." }]);
      expect(error).toBeInstanceOf(QontoApiError);
    });

    it("is NOT an instance of QontoScaRequiredError", () => {
      // Critical for executeWithSca's catch behaviour: it must not poll.
      const error = new QontoScaNotEnrolledError([{ code: "sca_not_enrolled", detail: "..." }]);
      expect(error).not.toBeInstanceOf(QontoScaRequiredError);
    });

    it("is an instance of Error", () => {
      const error = new QontoScaNotEnrolledError([{ code: "sca_not_enrolled", detail: "..." }]);
      expect(error).toBeInstanceOf(Error);
    });

    it("preserves error entries", () => {
      const error = new QontoScaNotEnrolledError([
        { code: "sca_not_enrolled", detail: "You must enable SCA to perform this action" },
      ]);
      expect(error.errors).toEqual([
        { code: "sca_not_enrolled", detail: "You must enable SCA to perform this action" },
      ]);
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
