// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { HttpClientOptions } from "@qontoctl/core";
import { createClient } from "./client.js";
import type { GlobalOptions } from "./options.js";

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    resolveConfig: vi.fn(),
    HttpClient: vi.fn(),
    refreshAccessToken: vi.fn(),
    saveOAuthTokens: vi.fn(),
  };
});

const { resolveConfig, HttpClient, refreshAccessToken, saveOAuthTokens } = await import("@qontoctl/core");
const resolveConfigMock = vi.mocked(resolveConfig);
const HttpClientMock = vi.mocked(HttpClient);
const refreshAccessTokenMock = vi.mocked(refreshAccessToken);
const saveOAuthTokensMock = vi.mocked(saveOAuthTokens);

describe("createClient", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    resolveConfigMock.mockResolvedValue({
      config: {
        apiKey: {
          organizationSlug: "test-org",
          secretKey: "test-secret",
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a client with resolved endpoint", async () => {
    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    expect(HttpClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://thirdparty.qonto.com",
      }),
    );
  });

  it("passes profile to resolveConfig", async () => {
    const options: GlobalOptions = { output: "table", profile: "work" };
    await createClient(options);
    expect(resolveConfigMock).toHaveBeenCalledWith({ profile: "work" });
  });

  it("prints warnings to stderr", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        apiKey: {
          organizationSlug: "test-org",
          secretKey: "test-secret",
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: ["Unknown key: foo"],
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);
    expect(stderrSpy).toHaveBeenCalledWith("Warning: Unknown key: foo\n");
  });

  it("throws when config has no API key", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {},
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });

    const options: GlobalOptions = { output: "table" };
    await expect(createClient(options)).rejects.toThrow("No credentials found in configuration");
  });

  it("creates client without logger by default", async () => {
    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    expect(ctorArgs?.logger).toBeUndefined();
  });

  it("creates a debug logger when --debug is set", async () => {
    const options: GlobalOptions = { output: "table", debug: true };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    const logger = ctorArgs?.logger;
    expect(logger).toBeDefined();

    logger?.verbose("verbose msg");
    expect(stderrSpy).toHaveBeenCalledWith("verbose msg\n");

    logger?.debug("debug msg");
    expect(stderrSpy).toHaveBeenCalledWith("debug msg\n");
  });

  it("emits a warning when --debug is set", async () => {
    const options: GlobalOptions = { output: "table", debug: true };
    await createClient(options);

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Debug mode logs full API responses"));
  });

  it("does not emit debug warning when only --verbose is set", async () => {
    const options: GlobalOptions = { output: "table", verbose: true };
    await createClient(options);

    const calls = stderrSpy.mock.calls.map((call: [string]) => call[0]) as string[];
    expect(calls.every((msg) => !msg.includes("Debug mode"))).toBe(true);
  });

  it("creates a verbose-only logger when --verbose is set", async () => {
    const options: GlobalOptions = { output: "table", verbose: true };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    const logger = ctorArgs?.logger;
    expect(logger).toBeDefined();

    logger?.verbose("verbose msg");
    expect(stderrSpy).toHaveBeenCalledWith("verbose msg\n");

    stderrSpy.mockClear();
    logger?.debug("debug msg");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("uses OAuth authorization when oauth config is present", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "access-token",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    expect(typeof ctorArgs?.authorization).toBe("function");
  });

  it("refreshes expired OAuth token on authorization call", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "old-token",
          refreshToken: "refresh-token",
          accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });
    refreshAccessTokenMock.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
    saveOAuthTokensMock.mockResolvedValue(undefined);

    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    const authFn = ctorArgs?.authorization as () => Promise<string>;
    await authFn();

    expect(refreshAccessTokenMock).toHaveBeenCalled();
    expect(saveOAuthTokensMock).toHaveBeenCalled();
  });

  it("does not refresh OAuth token when still valid", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "valid-token",
          refreshToken: "refresh-token",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    const authFn = ctorArgs?.authorization as () => Promise<string>;
    await authFn();

    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it("passes API key as fallback authorization when OAuth is primary and API key exists", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "access-token",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        apiKey: {
          organizationSlug: "org",
          secretKey: "key",
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    expect(ctorArgs?.fallbackAuthorization).toBeDefined();
    expect(typeof ctorArgs?.onFallback).toBe("function");
  });

  it("does not set fallback authorization when only OAuth is configured", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "access-token",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    expect(ctorArgs?.fallbackAuthorization).toBeUndefined();
  });

  it("does not set fallback authorization when only API key is configured", async () => {
    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    expect(ctorArgs?.fallbackAuthorization).toBeUndefined();
  });

  it("writes warning to stderr on fallback", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "access-token",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        apiKey: {
          organizationSlug: "org",
          secretKey: "key",
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    const onFallback = ctorArgs?.onFallback as (method: string, path: string) => void;
    onFallback("GET", "/v2/organizations");

    expect(stderrSpy).toHaveBeenCalledWith(
      "Warning: OAuth authentication failed, falling back to API key for GET /v2/organizations\n",
    );
  });

  it("passes profile when saving refreshed OAuth tokens", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "old-token",
          refreshToken: "refresh-token",
          accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });
    refreshAccessTokenMock.mockResolvedValue({
      accessToken: "new-token",
      refreshToken: "new-refresh",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
    saveOAuthTokensMock.mockResolvedValue(undefined);

    const options: GlobalOptions = { output: "table", profile: "work" };
    await createClient(options);

    const ctorArgs = HttpClientMock.mock.calls[0]?.[0] as HttpClientOptions | undefined;
    const authFn = ctorArgs?.authorization as () => Promise<string>;
    await authFn();

    expect(saveOAuthTokensMock).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "new-token" }), {
      profile: "work",
    });
  });
});
