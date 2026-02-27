// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient, QontoApiError, QontoRateLimitError } from "./http-client.js";

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

function jsonResponse(body: unknown, init?: ResponseInit): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
      ...init,
    }),
  );
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
      expect(url.searchParams.getAll("status[]")).toEqual([
        "pending",
        "completed",
      ]);
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

    it("returns undefined for 204 No Content responses", async () => {
      fetchSpy.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })));
      const client = new TestableHttpClient({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "slug:secret",
      });

      const result = await client.request("DELETE", "/v2/something");

      expect(result).toBeUndefined();
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
