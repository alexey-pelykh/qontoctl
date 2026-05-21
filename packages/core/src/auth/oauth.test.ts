// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import { buildOAuthAuthorization, OAuthNoTokenError } from "./oauth.js";
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

  it("throws OAuthNoTokenError when access token is undefined", () => {
    expect(() =>
      buildOAuthAuthorization({
        clientId: "my-client",
        clientSecret: "my-secret",
      }),
    ).toThrow(OAuthNoTokenError);
  });

  it("throws OAuthNoTokenError when access token is empty string", () => {
    expect(() =>
      buildOAuthAuthorization({
        clientId: "my-client",
        clientSecret: "my-secret",
        accessToken: "",
      }),
    ).toThrow(OAuthNoTokenError);
  });

  it("OAuthNoTokenError is also instanceof AuthError (subclass preserves catch sites)", () => {
    // The typed subclass widening (#631 PR2) must not break existing
    // `catch (e instanceof AuthError)` consumers. Asserting the
    // is-a relationship explicitly is a regression guard.
    let captured: unknown;
    try {
      buildOAuthAuthorization({
        clientId: "my-client",
        clientSecret: "my-secret",
      });
    } catch (err: unknown) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(OAuthNoTokenError);
    expect(captured).toBeInstanceOf(AuthError);
    expect((captured as Error).name).toBe("OAuthNoTokenError");
  });

  it("error message suggests running auth login (does NOT mention api-key — arm 4)", () => {
    // The error originates from the OAuth path; cross-mode credential
    // mentions ("Verify your API key credentials") would mislead users who
    // are NOT using api-key at all. The message stays OAuth-focused; the
    // CLI's error-handler layer adds mode-specific guidance.
    let captured: unknown;
    try {
      buildOAuthAuthorization({
        clientId: "my-client",
        clientSecret: "my-secret",
      });
    } catch (err: unknown) {
      captured = err;
    }
    const message = (captured as Error).message;
    expect(message).toMatch(/auth login/);
    expect(message.toLowerCase()).not.toContain("api-key");
    expect(message.toLowerCase()).not.toContain("api key");
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
