// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveConfig: vi.fn(),
  buildApiKeyAuthorization: vi.fn(),
  buildOAuthAuthorization: vi.fn(),
  refreshAccessToken: vi.fn(),
  saveOAuthTokens: vi.fn(),
  httpClientConstructor: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...original,
    resolveConfig: mocks.resolveConfig,
    buildApiKeyAuthorization: mocks.buildApiKeyAuthorization,
    buildOAuthAuthorization: mocks.buildOAuthAuthorization,
    refreshAccessToken: mocks.refreshAccessToken,
    saveOAuthTokens: mocks.saveOAuthTokens,
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    HttpClient: class MockHttpClient {
      constructor(options: unknown) {
        mocks.httpClientConstructor(options);
      }
    },
  };
});

import { buildClient } from "./client.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("buildClient", () => {
  it("resolves config and creates HttpClient with resolved endpoint", async () => {
    mocks.resolveConfig.mockResolvedValue({
      config: { apiKey: { organizationSlug: "org", secretKey: "key" } },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });
    mocks.buildApiKeyAuthorization.mockReturnValue("org:key");

    await buildClient();

    expect(mocks.resolveConfig).toHaveBeenCalledWith({ profile: undefined });
    expect(mocks.buildApiKeyAuthorization).toHaveBeenCalledWith({
      organizationSlug: "org",
      secretKey: "key",
    });
    expect(mocks.httpClientConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://thirdparty.qonto.com",
        authorization: "org:key",
      }),
    );
  });

  it("uses endpoint from resolveConfig", async () => {
    mocks.resolveConfig.mockResolvedValue({
      config: { apiKey: { organizationSlug: "org", secretKey: "key" }, endpoint: "https://custom.example.com" },
      endpoint: "https://custom.example.com",
      warnings: [],
    });
    mocks.buildApiKeyAuthorization.mockReturnValue("org:key");

    await buildClient();

    expect(mocks.httpClientConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://custom.example.com",
        authorization: "org:key",
      }),
    );
  });

  it("passes profile to resolveConfig", async () => {
    mocks.resolveConfig.mockResolvedValue({
      config: { apiKey: { organizationSlug: "org", secretKey: "key" } },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });
    mocks.buildApiKeyAuthorization.mockReturnValue("org:key");

    await buildClient({ profile: "my-profile" });

    expect(mocks.resolveConfig).toHaveBeenCalledWith({ profile: "my-profile" });
  });

  it("propagates ConfigError from resolveConfig", async () => {
    const { ConfigError } = await import("@qontoctl/core");
    mocks.resolveConfig.mockRejectedValue(new ConfigError("No credentials found"));

    await expect(buildClient()).rejects.toThrow("No credentials found");
  });

  it("throws when config has no credentials", async () => {
    mocks.resolveConfig.mockResolvedValue({
      config: {},
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });

    await expect(buildClient()).rejects.toThrow("No credentials found in configuration");
  });

  it("uses OAuth authorization when oauth config is present", async () => {
    mocks.resolveConfig.mockResolvedValue({
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
    mocks.buildOAuthAuthorization.mockReturnValue("Bearer access-token");

    await buildClient();

    expect(mocks.buildApiKeyAuthorization).not.toHaveBeenCalled();
    const ctorArgs = mocks.httpClientConstructor.mock.calls[0] as [{ authorization: unknown }];
    expect(typeof ctorArgs[0].authorization).toBe("function");

    // Invoke the authorization function to verify it calls buildOAuthAuthorization
    const authFn = ctorArgs[0].authorization as () => Promise<string>;
    const result = await authFn();
    expect(result).toBe("Bearer access-token");
    expect(mocks.buildOAuthAuthorization).toHaveBeenCalled();
  });

  it("refreshes expired OAuth token", async () => {
    const oauth = {
      clientId: "client-id",
      clientSecret: "client-secret",
      accessToken: "old-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
    };
    mocks.resolveConfig.mockResolvedValue({
      config: { oauth },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });
    mocks.refreshAccessToken.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
    mocks.buildOAuthAuthorization.mockReturnValue("Bearer new-access-token");
    mocks.saveOAuthTokens.mockResolvedValue(undefined);

    await buildClient();

    const ctorArgs = mocks.httpClientConstructor.mock.calls[0] as [{ authorization: unknown }];
    const authFn = ctorArgs[0].authorization as () => Promise<string>;
    await authFn();

    expect(mocks.refreshAccessToken).toHaveBeenCalled();
    expect(mocks.saveOAuthTokens).toHaveBeenCalled();
  });

  it("uses sandbox token URL when sandbox is true", async () => {
    const { OAUTH_TOKEN_SANDBOX_URL } = await import("@qontoctl/core");
    const oauth = {
      clientId: "client-id",
      clientSecret: "client-secret",
      accessToken: "old-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    mocks.resolveConfig.mockResolvedValue({
      config: { oauth, sandbox: true },
      endpoint: "https://thirdparty-sandbox.staging.qonto.co",
      warnings: [],
    });
    mocks.refreshAccessToken.mockResolvedValue({
      accessToken: "new-token",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
    mocks.buildOAuthAuthorization.mockReturnValue("Bearer new-token");
    mocks.saveOAuthTokens.mockResolvedValue(undefined);

    await buildClient();

    const ctorArgs = mocks.httpClientConstructor.mock.calls[0] as [{ authorization: unknown }];
    const authFn = ctorArgs[0].authorization as () => Promise<string>;
    await authFn();

    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(
      OAUTH_TOKEN_SANDBOX_URL,
      "client-id",
      "client-secret",
      "refresh-token",
    );
  });

  it("does not refresh when token is still valid", async () => {
    mocks.resolveConfig.mockResolvedValue({
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
    mocks.buildOAuthAuthorization.mockReturnValue("Bearer valid-token");

    await buildClient();

    const ctorArgs = mocks.httpClientConstructor.mock.calls[0] as [{ authorization: unknown }];
    const authFn = ctorArgs[0].authorization as () => Promise<string>;
    await authFn();

    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.saveOAuthTokens).not.toHaveBeenCalled();
  });

  it("passes API key as fallback authorization when OAuth is primary and API key exists", async () => {
    mocks.resolveConfig.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "access-token",
          accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        apiKey: { organizationSlug: "org", secretKey: "key" },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });
    mocks.buildOAuthAuthorization.mockReturnValue("Bearer access-token");
    mocks.buildApiKeyAuthorization.mockReturnValue("org:key");

    await buildClient();

    const ctorArgs = mocks.httpClientConstructor.mock.calls[0] as [
      { fallbackAuthorization: unknown; onFallback: unknown },
    ];
    expect(ctorArgs[0].fallbackAuthorization).toBe("org:key");
    expect(typeof ctorArgs[0].onFallback).toBe("function");
  });

  it("does not set fallback authorization when only OAuth is configured", async () => {
    mocks.resolveConfig.mockResolvedValue({
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
    mocks.buildOAuthAuthorization.mockReturnValue("Bearer access-token");

    await buildClient();

    const ctorArgs = mocks.httpClientConstructor.mock.calls[0] as [{ fallbackAuthorization: unknown }];
    expect(ctorArgs[0].fallbackAuthorization).toBeUndefined();
  });

  it("does not set fallback authorization when only API key is configured", async () => {
    mocks.resolveConfig.mockResolvedValue({
      config: { apiKey: { organizationSlug: "org", secretKey: "key" } },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });
    mocks.buildApiKeyAuthorization.mockReturnValue("org:key");

    await buildClient();

    const ctorArgs = mocks.httpClientConstructor.mock.calls[0] as [{ fallbackAuthorization: unknown }];
    expect(ctorArgs[0].fallbackAuthorization).toBeUndefined();
  });

  it("passes profile to saveOAuthTokens on refresh", async () => {
    const oauth = {
      clientId: "client-id",
      clientSecret: "client-secret",
      accessToken: "old-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    mocks.resolveConfig.mockResolvedValue({
      config: { oauth },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });
    mocks.refreshAccessToken.mockResolvedValue({
      accessToken: "new-token",
      refreshToken: "new-refresh",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
    mocks.buildOAuthAuthorization.mockReturnValue("Bearer new-token");
    mocks.saveOAuthTokens.mockResolvedValue(undefined);

    await buildClient({ profile: "work" });

    const ctorArgs = mocks.httpClientConstructor.mock.calls[0] as [{ authorization: unknown }];
    const authFn = ctorArgs[0].authorization as () => Promise<string>;
    await authFn();

    expect(mocks.saveOAuthTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "new-token",
        refreshToken: "new-refresh",
      }),
      { profile: "work" },
    );
  });
});
