// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import type { AuthPreference, QontoctlConfig } from "../config/types.js";
import { isAuthPreference, resolveAuthPreference, selectAuthChain } from "./preference.js";

describe("isAuthPreference", () => {
  it.each([
    ["api-key", true],
    ["api-key-first", true],
    ["oauth", true],
    ["oauth-first", true],
    ["api-key-only", false], // common typo
    ["api_key", false],
    ["", false],
    ["OAuth", false], // case-sensitive
  ])("isAuthPreference(%s) === %s", (value, expected) => {
    expect(isAuthPreference(value)).toBe(expected);
  });

  it("returns false for non-string inputs", () => {
    expect(isAuthPreference(undefined)).toBe(false);
    expect(isAuthPreference(null)).toBe(false);
    expect(isAuthPreference(42)).toBe(false);
    expect(isAuthPreference({ preference: "oauth" })).toBe(false);
  });
});

describe("resolveAuthPreference", () => {
  it("returns the override when supplied", () => {
    const config: QontoctlConfig = { auth: { preference: "oauth" } };
    expect(resolveAuthPreference(config, "api-key")).toBe("api-key");
  });

  it("returns config.auth.preference when no override", () => {
    const config: QontoctlConfig = { auth: { preference: "api-key-first" } };
    expect(resolveAuthPreference(config)).toBe("api-key-first");
  });

  it("returns the default (oauth-first) when neither override nor config sets it", () => {
    const config: QontoctlConfig = {};
    expect(resolveAuthPreference(config)).toBe("oauth-first");
  });

  it("returns the default when config.auth is present but preference is undefined", () => {
    const config: QontoctlConfig = { auth: {} };
    expect(resolveAuthPreference(config)).toBe("oauth-first");
  });

  it("override takes precedence even when config and override agree", () => {
    // Smoke check: the explicit-input branch fires first, regardless of config.
    const config: QontoctlConfig = { auth: { preference: "oauth-first" } };
    expect(resolveAuthPreference(config, "oauth-first")).toBe("oauth-first");
  });
});

describe("selectAuthChain — 4 modes × 4 credential states (16 cases)", () => {
  // Decision matrix from the helper's doc-comment, exhaustively asserted.
  type Setup = "both" | "api-key-only" | "oauth-only" | "none";
  const setupToAvailable: Record<Setup, { apiKey: boolean; oauth: boolean }> = {
    both: { apiKey: true, oauth: true },
    "api-key-only": { apiKey: true, oauth: false },
    "oauth-only": { apiKey: false, oauth: true },
    none: { apiKey: false, oauth: false },
  };

  interface Expected {
    primary: "api-key" | "oauth" | null;
    fallback: "api-key" | "oauth" | null;
    warning: boolean;
    noCredentials: boolean;
  }

  const cases: ReadonlyArray<{ mode: AuthPreference; setup: Setup; expect: Expected }> = [
    // api-key (no fallback)
    {
      mode: "api-key",
      setup: "both",
      expect: { primary: "api-key", fallback: null, warning: false, noCredentials: false },
    },
    {
      mode: "api-key",
      setup: "api-key-only",
      expect: { primary: "api-key", fallback: null, warning: false, noCredentials: false },
    },
    {
      mode: "api-key",
      setup: "oauth-only",
      expect: { primary: "oauth", fallback: null, warning: true, noCredentials: false },
    },
    { mode: "api-key", setup: "none", expect: { primary: null, fallback: null, warning: false, noCredentials: true } },
    // api-key-first
    {
      mode: "api-key-first",
      setup: "both",
      expect: { primary: "api-key", fallback: "oauth", warning: false, noCredentials: false },
    },
    {
      mode: "api-key-first",
      setup: "api-key-only",
      expect: { primary: "api-key", fallback: null, warning: false, noCredentials: false },
    },
    {
      mode: "api-key-first",
      setup: "oauth-only",
      expect: { primary: "oauth", fallback: null, warning: true, noCredentials: false },
    },
    {
      mode: "api-key-first",
      setup: "none",
      expect: { primary: null, fallback: null, warning: false, noCredentials: true },
    },
    // oauth (no fallback)
    {
      mode: "oauth",
      setup: "both",
      expect: { primary: "oauth", fallback: null, warning: false, noCredentials: false },
    },
    {
      mode: "oauth",
      setup: "api-key-only",
      expect: { primary: "api-key", fallback: null, warning: true, noCredentials: false },
    },
    {
      mode: "oauth",
      setup: "oauth-only",
      expect: { primary: "oauth", fallback: null, warning: false, noCredentials: false },
    },
    { mode: "oauth", setup: "none", expect: { primary: null, fallback: null, warning: false, noCredentials: true } },
    // oauth-first (default)
    {
      mode: "oauth-first",
      setup: "both",
      expect: { primary: "oauth", fallback: "api-key", warning: false, noCredentials: false },
    },
    {
      mode: "oauth-first",
      setup: "api-key-only",
      expect: { primary: "api-key", fallback: null, warning: true, noCredentials: false },
    },
    {
      mode: "oauth-first",
      setup: "oauth-only",
      expect: { primary: "oauth", fallback: null, warning: false, noCredentials: false },
    },
    {
      mode: "oauth-first",
      setup: "none",
      expect: { primary: null, fallback: null, warning: false, noCredentials: true },
    },
  ];

  for (const c of cases) {
    it(`mode=${c.mode} setup=${c.setup} -> primary=${c.expect.primary} fallback=${c.expect.fallback} warning=${c.expect.warning} noCreds=${c.expect.noCredentials}`, () => {
      const selection = selectAuthChain(c.mode, setupToAvailable[c.setup]);

      expect(selection.primary).toBe(c.expect.primary);
      expect(selection.fallback).toBe(c.expect.fallback);
      expect(selection.noCredentials).toBe(c.expect.noCredentials);

      if (c.expect.warning) {
        expect(selection.warning).toBeDefined();
        expect(typeof selection.warning).toBe("string");
        // Warning must mention the requested preference so the user can find it
        // in the codebase / docs without ambiguity.
        expect(selection.warning).toContain(c.mode);
      } else {
        expect(selection.warning).toBeUndefined();
      }

      // Default 16-case matrix never sets fatal — apiKeyInvalidReason is
      // unset for these cases. The fatal-overlay matrix below exercises it.
      expect(selection.fatal).toBeUndefined();
    });
  }
});

describe("selectAuthChain — fatal-config overlay (#631 PR2 security-architect invariant)", () => {
  // The fatal-config overlay encodes: a user who explicitly chose api-key as
  // primary (api-key or api-key-first) MUST NOT silently fall back to OAuth
  // when api-key credentials are present-but-invalid. The overlay is set on
  // `AuthChainSelection.fatal`; the caller (CLI/MCP createClient) is
  // responsible for throwing a ConfigError before constructing any HttpClient.
  //
  // In production, `resolveConfig` rejects empty `organization-slug` /
  // `secret-key` at config-load time before `selectAuthChain` runs — so the
  // overlay is defense-in-depth, not the primary enforcement. The unit test
  // exercises the matrix directly, bypassing resolveConfig.

  describe("api-key preference", () => {
    it("sets fatal when api-key is present-but-invalid (empty-slug)", () => {
      const selection = selectAuthChain("api-key", { apiKey: true, oauth: false, apiKeyInvalidReason: "empty-slug" });
      expect(selection.fatal).toBeDefined();
      expect(selection.fatal?.mode).toBe("api-key");
      expect(selection.fatal?.reason).toContain("empty-slug");
      expect(selection.fatal?.reason).toContain('"api-key"');
      // The primary/fallback slots are still populated for observability —
      // the explicit fatal check is the gate.
      expect(selection.primary).toBe("api-key");
      expect(selection.fallback).toBeNull();
    });

    it("sets fatal when api-key is present-but-invalid (empty-secret)", () => {
      const selection = selectAuthChain("api-key", { apiKey: true, oauth: false, apiKeyInvalidReason: "empty-secret" });
      expect(selection.fatal).toBeDefined();
      expect(selection.fatal?.mode).toBe("api-key");
      expect(selection.fatal?.reason).toContain("empty-secret");
    });

    it("does NOT set fatal when api-key creds are valid", () => {
      const selection = selectAuthChain("api-key", { apiKey: true, oauth: false });
      expect(selection.fatal).toBeUndefined();
    });

    it("does NOT set fatal in the degrade path (no api-key, only oauth)", () => {
      // The degrade path doesn't reach the apiKeyInvalidReason branch
      // because apiKey is false. The OAuth degrade is the safe path.
      const selection = selectAuthChain("api-key", { apiKey: false, oauth: true, apiKeyInvalidReason: "empty-slug" });
      expect(selection.fatal).toBeUndefined();
      expect(selection.primary).toBe("oauth");
    });
  });

  describe("api-key-first preference", () => {
    it("sets fatal when api-key is present-but-invalid AND oauth is present (refuses silent OAuth fallback)", () => {
      // This is the headline AC-3 case: the user explicitly chose
      // api-key-first with broken api-key creds. The security-architect
      // invariant: must NOT silently fall back to OAuth (the explicit
      // primary intent is api-key).
      const selection = selectAuthChain("api-key-first", {
        apiKey: true,
        oauth: true,
        apiKeyInvalidReason: "empty-secret",
      });
      expect(selection.fatal).toBeDefined();
      expect(selection.fatal?.mode).toBe("api-key-first");
      expect(selection.fatal?.reason).toContain("empty-secret");
      expect(selection.fatal?.reason).toContain('"api-key-first"');
      expect(selection.fatal?.reason).toContain("refusing to silently fall back to OAuth");
      // Slots still populated for observability.
      expect(selection.primary).toBe("api-key");
      expect(selection.fallback).toBe("oauth");
    });

    it("sets fatal when api-key is present-but-invalid (oauth absent)", () => {
      const selection = selectAuthChain("api-key-first", {
        apiKey: true,
        oauth: false,
        apiKeyInvalidReason: "empty-slug",
      });
      expect(selection.fatal).toBeDefined();
      expect(selection.fatal?.mode).toBe("api-key-first");
      expect(selection.fatal?.reason).toContain("empty-slug");
    });

    it("does NOT set fatal when api-key creds are valid", () => {
      const selection = selectAuthChain("api-key-first", { apiKey: true, oauth: true });
      expect(selection.fatal).toBeUndefined();
    });
  });

  describe("oauth / oauth-first preferences (regression guard — fatal must NOT fire)", () => {
    // The oauth / oauth-first preferences MUST NOT populate fatal even when
    // apiKeyInvalidReason is set — the user explicitly chose OAuth as
    // primary, so an api-key configuration issue (in what is at most the
    // fallback slot) is not fatal to the request flow. The invariant is
    // "respect the user's explicit primary."

    it("oauth bare-mode does NOT set fatal even when api-key is invalid (no silent-fallback regression guard for arm 1)", () => {
      const selection = selectAuthChain("oauth", { apiKey: true, oauth: true, apiKeyInvalidReason: "empty-secret" });
      expect(selection.fatal).toBeUndefined();
      // oauth bare-mode wires no fallback at all (G2 security invariant).
      expect(selection.primary).toBe("oauth");
      expect(selection.fallback).toBeNull();
    });

    it("oauth-first does NOT set fatal even when api-key fallback is invalid", () => {
      // The user explicitly chose oauth as primary. If api-key fallback has
      // problems, that's not fatal — OAuth may succeed; the api-key
      // configuration issue surfaces later (with a clear AuthError) IF the
      // OAuth path fails AND the fallback engages.
      const selection = selectAuthChain("oauth-first", {
        apiKey: true,
        oauth: true,
        apiKeyInvalidReason: "empty-secret",
      });
      expect(selection.fatal).toBeUndefined();
      expect(selection.primary).toBe("oauth");
      expect(selection.fallback).toBe("api-key");
    });
  });

  describe("oauth bare-mode no-fallback regression guard (G2 / arm 1 invariant)", () => {
    // The widened http-client fallback gate (#631 PR2) makes OAuthNoTokenError
    // engage fallbacks — but only when fallbackAuthorization is wired in. The
    // matrix returns fallback=null for `oauth` bare-mode in every credential
    // combination — even with both creds present. This is the structural
    // guarantee that `oauth` bare-mode does not silently degrade to api-key
    // when OAuth has no token at request time (the user explicitly chose
    // oauth bare-mode and must see OAuth failures, not silent api-key use).

    it("oauth bare-mode with both creds → primary oauth, NO fallback (no silent api-key)", () => {
      const selection = selectAuthChain("oauth", { apiKey: true, oauth: true });
      expect(selection.primary).toBe("oauth");
      expect(selection.fallback).toBeNull();
    });

    it("oauth bare-mode with oauth-only → primary oauth, no fallback", () => {
      const selection = selectAuthChain("oauth", { apiKey: false, oauth: true });
      expect(selection.primary).toBe("oauth");
      expect(selection.fallback).toBeNull();
    });
  });
});
