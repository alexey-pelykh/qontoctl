// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import { buildOAuthAuthorization } from "./oauth.js";
import { AuthError } from "./api-key.js";

describe("buildOAuthAuthorization", () => {
  it("returns Bearer token when access token is present", () => {
    const result = buildOAuthAuthorization({
      clientId: "my-client",
      clientSecret: "my-secret",
      accessToken: "abc123",
    });

    expect(result).toBe("Bearer abc123");
  });

  it("throws AuthError when access token is undefined", () => {
    expect(() =>
      buildOAuthAuthorization({
        clientId: "my-client",
        clientSecret: "my-secret",
      }),
    ).toThrow(AuthError);
  });

  it("throws AuthError when access token is empty string", () => {
    expect(() =>
      buildOAuthAuthorization({
        clientId: "my-client",
        clientSecret: "my-secret",
        accessToken: "",
      }),
    ).toThrow(AuthError);
  });

  it("error message suggests running auth login", () => {
    expect(() =>
      buildOAuthAuthorization({
        clientId: "my-client",
        clientSecret: "my-secret",
      }),
    ).toThrow(/auth login/);
  });

  it("preserves special characters in access token", () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
    const result = buildOAuthAuthorization({
      clientId: "my-client",
      clientSecret: "my-secret",
      accessToken: token,
    });

    expect(result).toBe(`Bearer ${token}`);
  });
});
