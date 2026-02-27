// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveConfig: vi.fn(),
  buildApiKeyAuthorization: vi.fn(),
  httpClientConstructor: vi.fn(),
}));

vi.mock("@qontoctl/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...original,
    resolveConfig: mocks.resolveConfig,
    buildApiKeyAuthorization: mocks.buildApiKeyAuthorization,
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
    expect(mocks.httpClientConstructor).toHaveBeenCalledWith({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "org:key",
    });
  });

  it("uses endpoint from resolveConfig", async () => {
    mocks.resolveConfig.mockResolvedValue({
      config: { apiKey: { organizationSlug: "org", secretKey: "key" }, endpoint: "https://custom.example.com" },
      endpoint: "https://custom.example.com",
      warnings: [],
    });
    mocks.buildApiKeyAuthorization.mockReturnValue("org:key");

    await buildClient();

    expect(mocks.httpClientConstructor).toHaveBeenCalledWith({
      baseUrl: "https://custom.example.com",
      authorization: "org:key",
    });
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
});
