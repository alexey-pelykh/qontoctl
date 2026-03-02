// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateCodeChallenge, generateCodeVerifier } from "./pkce.js";

describe("generateCodeVerifier", () => {
  it("returns a base64url string", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns a 43-character string (32 bytes base64url-encoded)", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBe(43);
  });

  it("generates unique values on each call", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe("generateCodeChallenge", () => {
  it("returns a base64url-encoded SHA-256 hash", () => {
    const verifier = "test-verifier";
    const challenge = generateCodeChallenge(verifier);

    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  it("returns a base64url string without padding", () => {
    const challenge = generateCodeChallenge("some-verifier");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toContain("=");
  });

  it("produces different challenges for different verifiers", () => {
    const a = generateCodeChallenge("verifier-a");
    const b = generateCodeChallenge("verifier-b");
    expect(a).not.toBe(b);
  });

  it("produces consistent output for same input", () => {
    const a = generateCodeChallenge("consistent-verifier");
    const b = generateCodeChallenge("consistent-verifier");
    expect(a).toBe(b);
  });
});
