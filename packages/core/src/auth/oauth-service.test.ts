// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeCode, refreshAccessToken, revokeToken } from "./oauth-service.js";
import { AuthError } from "./api-key.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(text: string, status: number): Response {
  return new Response(text, { status });
}

describe("exchangeCode", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exchanges authorization code for tokens", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        access_token: "access-123",
        refresh_token: "refresh-456",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    );

    const tokens = await exchangeCode(
      "https://oauth.example.com/token",
      "client-id",
      "client-secret",
      "auth-code",
      "http://localhost:8080/callback",
    );

    expect(tokens).toEqual({
      accessToken: "access-123",
      refreshToken: "refresh-456",
      expiresIn: 3600,
      tokenType: "Bearer",
    });

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth.example.com/token");
    expect(options.method).toBe("POST");
    const body = new URLSearchParams(options.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("client-id");
    expect(body.get("client_secret")).toBe("client-secret");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("redirect_uri")).toBe("http://localhost:8080/callback");
    expect(body.has("code_verifier")).toBe(false);
  });

  it("includes code_verifier when provided", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        access_token: "access-123",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    );

    await exchangeCode(
      "https://oauth.example.com/token",
      "client-id",
      "client-secret",
      "auth-code",
      "http://localhost:8080/callback",
      "my-code-verifier",
    );

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(options.body as string);
    expect(body.get("code_verifier")).toBe("my-code-verifier");
  });

  it("throws AuthError on non-OK response", async () => {
    vi.mocked(fetch).mockResolvedValue(textResponse("invalid_grant", 400));

    await expect(
      exchangeCode(
        "https://oauth.example.com/token",
        "client-id",
        "client-secret",
        "bad-code",
        "http://localhost:8080/callback",
      ),
    ).rejects.toThrow(AuthError);
  });

  it("includes status and response text in error message", async () => {
    vi.mocked(fetch).mockResolvedValue(textResponse("invalid_grant", 400));

    await expect(
      exchangeCode(
        "https://oauth.example.com/token",
        "client-id",
        "client-secret",
        "bad-code",
        "http://localhost:8080/callback",
      ),
    ).rejects.toThrow(/400/);
  });
});

describe("refreshAccessToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes tokens using refresh token", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    );

    const tokens = await refreshAccessToken(
      "https://oauth.example.com/token",
      "client-id",
      "client-secret",
      "refresh-token",
    );

    expect(tokens).toEqual({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresIn: 3600,
      tokenType: "Bearer",
    });

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(options.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-token");
  });

  it("throws AuthError on failure", async () => {
    vi.mocked(fetch).mockResolvedValue(textResponse("invalid_grant", 400));

    await expect(
      refreshAccessToken("https://oauth.example.com/token", "client-id", "client-secret", "bad-refresh"),
    ).rejects.toThrow(AuthError);
  });
});

describe("revokeToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("revokes a token successfully", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      revokeToken("https://oauth.example.com/revoke", "client-id", "client-secret", "token-to-revoke"),
    ).resolves.toBeUndefined();

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(options.body as string);
    expect(body.get("client_id")).toBe("client-id");
    expect(body.get("client_secret")).toBe("client-secret");
    expect(body.get("token")).toBe("token-to-revoke");
  });

  it("throws AuthError on failure", async () => {
    vi.mocked(fetch).mockResolvedValue(textResponse("server error", 500));

    await expect(
      revokeToken("https://oauth.example.com/revoke", "client-id", "client-secret", "some-token"),
    ).rejects.toThrow(AuthError);
  });
});
