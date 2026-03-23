// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveConfig: vi.fn(),
  buildApiKeyAuthorization: vi.fn(),
  createOAuthAuthorization: vi.fn(),
  httpClientConstructor: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...original,
    resolveConfig: mocks.resolveConfig,
    buildApiKeyAuthorization: mocks.buildApiKeyAuthorization,
    createOAuthAuthorization: mocks.createOAuthAuthorization,
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

  it("uses createOAuthAuthorization when oauth config is present", async () => {
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer access-token");
    mocks.createOAuthAuthorization.mockReturnValue(oauthAuthFn);
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

    await buildClient();

    expect(mocks.buildApiKeyAuthorization).not.toHaveBeenCalled();
    expect(mocks.createOAuthAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        oauth: expect.objectContaining({ clientId: "client-id" }),
        tokenUrl: "https://oauth.qonto.com/oauth2/token",
      }),
    );
    const ctorArgs = mocks.httpClientConstructor.mock.calls[0] as [{ authorization: unknown }];
    expect(ctorArgs[0].authorization).toBe(oauthAuthFn);
  });

  it("uses sandbox token URL when sandbox is true", async () => {
    const { OAUTH_TOKEN_SANDBOX_URL } = await import("@qontoctl/core");
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer token");
    mocks.createOAuthAuthorization.mockReturnValue(oauthAuthFn);
    mocks.resolveConfig.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "token",
        },
        sandbox: true,
      },
      endpoint: "https://thirdparty-sandbox.staging.qonto.co",
      warnings: [],
    });

    await buildClient();

    expect(mocks.createOAuthAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenUrl: OAUTH_TOKEN_SANDBOX_URL,
      }),
    );
  });

  it("passes profile to createOAuthAuthorization", async () => {
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer token");
    mocks.createOAuthAuthorization.mockReturnValue(oauthAuthFn);
    mocks.resolveConfig.mockResolvedValue({
      config: {
        oauth: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "token",
        },
      },
      endpoint: "https://thirdparty.qonto.com",
      warnings: [],
    });

    await buildClient({ profile: "work" });

    expect(mocks.createOAuthAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: "work",
      }),
    );
  });

  it("passes API key as fallback authorization when OAuth is primary and API key exists", async () => {
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer access-token");
    mocks.createOAuthAuthorization.mockReturnValue(oauthAuthFn);
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
    mocks.buildApiKeyAuthorization.mockReturnValue("org:key");

    await buildClient();

    const ctorArgs = mocks.httpClientConstructor.mock.calls[0] as [
      { fallbackAuthorization: unknown; onFallback: unknown },
    ];
    expect(ctorArgs[0].fallbackAuthorization).toBe("org:key");
    expect(typeof ctorArgs[0].onFallback).toBe("function");
  });

  it("does not set fallback authorization when only OAuth is configured", async () => {
    const oauthAuthFn = vi.fn().mockResolvedValue("Bearer access-token");
    mocks.createOAuthAuthorization.mockReturnValue(oauthAuthFn);
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
});
