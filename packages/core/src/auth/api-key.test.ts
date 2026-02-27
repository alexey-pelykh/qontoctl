// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { buildApiKeyAuthorization, AuthError } from "./api-key.js";

describe("buildApiKeyAuthorization", () => {
  it("returns slug:key format", () => {
    const result = buildApiKeyAuthorization({
      organizationSlug: "my-org",
      secretKey: "my-secret",
    });
    expect(result).toBe("my-org:my-secret");
  });

  it("does not Base64-encode the value", () => {
    const result = buildApiKeyAuthorization({
      organizationSlug: "org",
      secretKey: "key",
    });
    expect(result).toBe("org:key");
    expect(result).not.toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("throws AuthError when organization slug is empty", () => {
    expect(() =>
      buildApiKeyAuthorization({
        organizationSlug: "",
        secretKey: "my-secret",
      }),
    ).toThrow(AuthError);
    expect(() =>
      buildApiKeyAuthorization({
        organizationSlug: "",
        secretKey: "my-secret",
      }),
    ).toThrow(/Missing organization slug/);
  });

  it("throws AuthError when secret key is empty", () => {
    expect(() =>
      buildApiKeyAuthorization({
        organizationSlug: "my-org",
        secretKey: "",
      }),
    ).toThrow(AuthError);
    expect(() =>
      buildApiKeyAuthorization({
        organizationSlug: "my-org",
        secretKey: "",
      }),
    ).toThrow(/Missing secret key/);
  });

  it("preserves special characters in credentials", () => {
    const result = buildApiKeyAuthorization({
      organizationSlug: "org-with-dashes",
      secretKey: "key/with+special=chars",
    });
    expect(result).toBe("org-with-dashes:key/with+special=chars");
  });
});
