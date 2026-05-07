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
    expect(refreshAccessToken).toHaveBeenCalledWith("https://token.example.com", "cid", "csecret", "rt", undefined);
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

  describe("readOnly mode (env-supplied access token)", () => {
    it("skips refresh and disk write when readOnly is true even if token is near expiry and refresh-token exists", async () => {
      const oauth: OAuthCredentials = {
        clientId: "cid",
        clientSecret: "csecret",
        accessToken: "env-supplied-token",
        refreshToken: "rt-from-file",
        accessTokenExpiresAt: "2026-01-15T12:00:30.000Z", // 30s from now — would normally trigger refresh
      };

      const authorize = createOAuthAuthorization({
        oauth,
        tokenUrl: "https://token.example.com",
        profile: "work",
        readOnly: true,
      });
      const result = await authorize();

      expect(result).toBe("Bearer env-supplied-token");
      expect(refreshAccessToken).not.toHaveBeenCalled();
      expect(saveOAuthTokens).not.toHaveBeenCalled();
      // Token mutation must not occur when readOnly
      expect(oauth.accessToken).toBe("env-supplied-token");
      expect(oauth.refreshToken).toBe("rt-from-file");
    });

    it("works for one invocation when only env-supplied access token is present (no refresh-token, no expiry)", async () => {
      // Simulates: QONTOCTL_ACCESS_TOKEN set in env, no file → only access-token available
      const oauth: OAuthCredentials = {
        clientId: "cid",
        clientSecret: "csecret",
        accessToken: "env-only-token",
        // no refreshToken, no accessTokenExpiresAt
      };

      const authorize = createOAuthAuthorization({
        oauth,
        tokenUrl: "https://token.example.com",
        readOnly: true,
      });
      const result = await authorize();

      expect(result).toBe("Bearer env-only-token");
      expect(refreshAccessToken).not.toHaveBeenCalled();
      expect(saveOAuthTokens).not.toHaveBeenCalled();
    });

    it("returns the env-supplied bearer even when the paired file expiry is in the past (let the API surface 401)", async () => {
      // Env-supplied access-token with file's stale expiry. Factory must NOT
      // attempt refresh: the API surfaces a clear 401, and the user re-issues.
      const oauth: OAuthCredentials = {
        clientId: "cid",
        clientSecret: "csecret",
        accessToken: "env-supplied-token",
        refreshToken: "rt-from-file",
        accessTokenExpiresAt: "2026-01-15T10:00:00.000Z", // 2 hours in the past
      };

      const authorize = createOAuthAuthorization({
        oauth,
        tokenUrl: "https://token.example.com",
        readOnly: true,
      });
      const result = await authorize();

      expect(result).toBe("Bearer env-supplied-token");
      expect(refreshAccessToken).not.toHaveBeenCalled();
      expect(saveOAuthTokens).not.toHaveBeenCalled();
    });

    it("default (readOnly omitted) preserves existing refresh-and-save behavior", async () => {
      // Regression guard: omitting readOnly must NOT silently flip to read-only.
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

      const authorize = createOAuthAuthorization({
        oauth,
        tokenUrl: "https://token.example.com",
        // readOnly omitted → defaults to false
      });
      const result = await authorize();

      expect(result).toBe("Bearer new-token");
      expect(refreshAccessToken).toHaveBeenCalled();
      expect(saveOAuthTokens).toHaveBeenCalled();
    });

    it("explicit readOnly: false also preserves refresh-and-save behavior", async () => {
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

      const authorize = createOAuthAuthorization({
        oauth,
        tokenUrl: "https://token.example.com",
        readOnly: false,
      });
      await authorize();

      expect(refreshAccessToken).toHaveBeenCalled();
      expect(saveOAuthTokens).toHaveBeenCalled();
    });

    it("regression: refresh roundtrip from a complete file does NOT degrade fields when readOnly is false", async () => {
      // Sanity check that the asymmetry symptom is gone — env-overlay no
      // longer shadows refresh results because it never reads refresh-token
      // from env. This factory test exercises just the factory side: a
      // file-based config completes a refresh roundtrip with all fields
      // updated as expected.
      const oauth: OAuthCredentials = {
        clientId: "cid",
        clientSecret: "csecret",
        accessToken: "old-at",
        refreshToken: "old-rt",
        accessTokenExpiresAt: "2026-01-15T12:00:10.000Z",
        scopes: ["organizations.read", "transactions.read"],
        stagingToken: "staging-tok",
      };

      vi.mocked(refreshAccessToken).mockResolvedValue({
        accessToken: "new-at",
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
      await authorize();

      // Refresh roundtrip succeeded and updated both tokens + expiry
      expect(oauth.accessToken).toBe("new-at");
      expect(oauth.refreshToken).toBe("new-rt");
      expect(oauth.accessTokenExpiresAt).toBe("2026-01-15T13:00:00.000Z");
      // Static fields untouched
      expect(oauth.clientId).toBe("cid");
      expect(oauth.clientSecret).toBe("csecret");
      expect(oauth.stagingToken).toBe("staging-tok");
      expect(oauth.scopes).toEqual(["organizations.read", "transactions.read"]);
      // Save was called with the full updated token set
      expect(saveOAuthTokens).toHaveBeenCalledWith(
        {
          accessToken: "new-at",
          refreshToken: "new-rt",
          accessTokenExpiresAt: "2026-01-15T13:00:00.000Z",
        },
        { profile: "work" },
      );
    });
  });
});
