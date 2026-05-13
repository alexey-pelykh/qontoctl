// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import type { QontoctlConfig } from "../config/types.js";
import { applyTripwire, buildRedactionContext, whitelistEvidence } from "./redaction.js";

describe("whitelistEvidence", () => {
  it("returns undefined when evidence is undefined", () => {
    expect(whitelistEvidence(undefined, ["a", "b"])).toBeUndefined();
  });

  it("drops fields not in the allowed list", () => {
    const evidence = { slug: "abc", balance_cents: 1000, iban: "FR761234567890123456789012" };
    expect(whitelistEvidence(evidence, ["slug"])).toEqual({ slug: "abc" });
  });

  it("returns undefined when no fields survive the whitelist (avoids empty {})", () => {
    expect(whitelistEvidence({ secret: "leak" }, ["safe"])).toBeUndefined();
  });

  it("returns the same shape when every field is allowed", () => {
    const ev = { a: 1, b: 2 };
    expect(whitelistEvidence(ev, ["a", "b"])).toEqual({ a: 1, b: 2 });
  });

  it("preserves non-string values verbatim", () => {
    const ev = { count: 5, present: true, items: [1, 2] };
    expect(whitelistEvidence(ev, ["count", "present", "items"])).toEqual(ev);
  });
});

describe("applyTripwire", () => {
  it("scrubs literal secrets above the 8-char threshold", () => {
    const ctx = { secrets: ["super-secret-token-12345"] };
    const { cleaned, leaks } = applyTripwire("token=super-secret-token-12345", ctx);
    expect(cleaned).toBe("token=[redacted-secret]");
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toContain("literal-secret");
  });

  it("ignores literal secrets shorter than 8 chars (false-positive guard)", () => {
    const ctx = { secrets: ["short"] };
    const { cleaned, leaks } = applyTripwire("noise short noise", ctx);
    expect(cleaned).toBe("noise short noise");
    expect(leaks).toEqual([]);
  });

  it("scrubs JWT-like tokens", () => {
    const text = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const { cleaned, leaks } = applyTripwire(text, { secrets: [] });
    // Bearer regex consumes the leading "Bearer ", then JWT regex would match
    // anything left — verify no JWT remains in output.
    expect(cleaned).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(leaks.length).toBeGreaterThan(0);
  });

  it("scrubs full IBAN values", () => {
    const { cleaned, leaks } = applyTripwire("iban=FR7612345987650123456789012", { secrets: [] });
    expect(cleaned).toBe("iban=[redacted-iban]");
    expect(leaks).toContain("iban-like");
  });

  it("scrubs PAN-like 13-19 digit numbers", () => {
    const { cleaned, leaks } = applyTripwire("pan=4111111111111111", { secrets: [] });
    expect(cleaned).toBe("pan=[redacted-pan]");
    expect(leaks).toContain("pan-like-number");
  });

  it("returns input unchanged with empty leaks when nothing matches", () => {
    const { cleaned, leaks } = applyTripwire("plain text 200 OK", { secrets: ["never-matches"] });
    expect(cleaned).toBe("plain text 200 OK");
    expect(leaks).toEqual([]);
  });
});

describe("buildRedactionContext", () => {
  it("collects every present credential value into secrets", () => {
    const config: QontoctlConfig = {
      apiKey: { organizationSlug: "slug", secretKey: "ak-secret-very-long-12345" },
      oauth: {
        clientId: "client-id",
        clientSecret: "cs-very-long-12345",
        accessToken: "at-very-long-12345",
        refreshToken: "rt-very-long-12345",
        stagingToken: "st-very-long-12345",
      },
    };
    const ctx = buildRedactionContext(config);
    expect(ctx.secrets).toContain("ak-secret-very-long-12345");
    expect(ctx.secrets).toContain("cs-very-long-12345");
    expect(ctx.secrets).toContain("at-very-long-12345");
    expect(ctx.secrets).toContain("rt-very-long-12345");
    expect(ctx.secrets).toContain("st-very-long-12345");
  });

  it("returns an empty secrets array when no credentials are configured", () => {
    expect(buildRedactionContext({}).secrets).toEqual([]);
  });

  it("omits credential slots that are absent without throwing", () => {
    const config: QontoctlConfig = {
      apiKey: { organizationSlug: "slug", secretKey: "ak-secret-12345" },
    };
    const ctx = buildRedactionContext(config);
    expect(ctx.secrets).toEqual(["ak-secret-12345"]);
  });
});
