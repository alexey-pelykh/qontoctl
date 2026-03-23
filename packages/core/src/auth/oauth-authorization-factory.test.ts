// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OAuthCredentials } from "../config/types.js";

vi.mock("./oauth-service.js", () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock("../config/index.js", () => ({
  saveOAuthTokens: vi.fn(),
}));

const { refreshAccessToken } = await import("./oauth-service.js");
const { saveOAuthTokens } = await import("../config/index.js");
const { createOAuthAuthorization } = await import("./oauth-authorization-factory.js");

describe("createOAuthAuthorization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns Bearer token when token is fresh", async () => {
    const oauth: OAuthCredentials = {
      clientId: "cid",
      clientSecret: "csecret",
      accessToken: "fresh-token",
      refreshToken: "rt",
      accessTokenExpiresAt: "2026-01-15T12:05:00.000Z", // 5 min from now
    };

    const authorize = createOAuthAuthorization({ oauth, tokenUrl: "https://token.example.com" });
    const result = await authorize();

    expect(result).toBe("Bearer fresh-token");
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(saveOAuthTokens).not.toHaveBeenCalled();
  });

  it("refreshes token when expiry is less than 60s away", async () => {
    const oauth: OAuthCredentials = {
      clientId: "cid",
      clientSecret: "csecret",
      accessToken: "old-token",
      refreshToken: "rt",
      accessTokenExpiresAt: "2026-01-15T12:00:30.000Z", // 30s from now
    };

    vi.mocked(refreshAccessToken).mockResolvedValue({
      accessToken: "new-token",
      refreshToken: "new-rt",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
    vi.mocked(saveOAuthTokens).mockResolvedValue();

    const authorize = createOAuthAuthorization({
      oauth,
      tokenUrl: "https://token.example.com",
      profile: "work",
    });
    const result = await authorize();

    expect(result).toBe("Bearer new-token");
    expect(refreshAccessToken).toHaveBeenCalledWith("https://token.example.com", "cid", "csecret", "rt");
    expect(oauth.accessToken).toBe("new-token");
    expect(oauth.refreshToken).toBe("new-rt");
    expect(oauth.accessTokenExpiresAt).toBe("2026-01-15T13:00:00.000Z");
    expect(saveOAuthTokens).toHaveBeenCalledWith(
      {
        accessToken: "new-token",
        refreshToken: "new-rt",
        accessTokenExpiresAt: "2026-01-15T13:00:00.000Z",
      },
      { profile: "work" },
    );
  });

  it("skips refresh when no refresh token is available", async () => {
    const oauth: OAuthCredentials = {
      clientId: "cid",
      clientSecret: "csecret",
      accessToken: "existing-token",
      accessTokenExpiresAt: "2026-01-15T12:00:10.000Z", // expiring soon, but no refresh token
    };

    const authorize = createOAuthAuthorization({ oauth, tokenUrl: "https://token.example.com" });
    const result = await authorize();

    expect(result).toBe("Bearer existing-token");
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("preserves existing refresh token when server does not rotate", async () => {
    const oauth: OAuthCredentials = {
      clientId: "cid",
      clientSecret: "csecret",
      accessToken: "old-token",
      refreshToken: "original-rt",
      accessTokenExpiresAt: "2026-01-15T12:00:10.000Z",
    };

    vi.mocked(refreshAccessToken).mockResolvedValue({
      accessToken: "new-token",
      expiresIn: 3600,
      tokenType: "Bearer",
      // no refreshToken in response
    });
    vi.mocked(saveOAuthTokens).mockResolvedValue();

    const authorize = createOAuthAuthorization({ oauth, tokenUrl: "https://token.example.com" });
    await authorize();

    expect(oauth.refreshToken).toBe("original-rt");
    expect(saveOAuthTokens).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "original-rt" }), undefined);
  });

  it("passes undefined options to saveOAuthTokens when no profile", async () => {
    const oauth: OAuthCredentials = {
      clientId: "cid",
      clientSecret: "csecret",
      accessToken: "old-token",
      refreshToken: "rt",
      accessTokenExpiresAt: "2026-01-15T12:00:10.000Z",
    };

    vi.mocked(refreshAccessToken).mockResolvedValue({
      accessToken: "new-token",
      refreshToken: "new-rt",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
    vi.mocked(saveOAuthTokens).mockResolvedValue();

    const authorize = createOAuthAuthorization({ oauth, tokenUrl: "https://token.example.com" });
    await authorize();

    expect(saveOAuthTokens).toHaveBeenCalledWith(expect.any(Object), undefined);
  });

  it("skips refresh when no expiry timestamp is set", async () => {
    const oauth: OAuthCredentials = {
      clientId: "cid",
      clientSecret: "csecret",
      accessToken: "token-no-expiry",
      refreshToken: "rt",
      // no accessTokenExpiresAt
    };

    const authorize = createOAuthAuthorization({ oauth, tokenUrl: "https://token.example.com" });
    const result = await authorize();

    expect(result).toBe("Bearer token-no-expiry");
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});
