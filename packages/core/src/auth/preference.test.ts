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
    });
  }
});
