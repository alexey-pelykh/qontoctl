// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { API_BASE_URL, SANDBOX_BASE_URL } from "./constants.js";

describe("constants", () => {
  it("API_BASE_URL points to production endpoint", () => {
    expect(API_BASE_URL).toBe("https://thirdparty.qonto.com");
  });

  it("SANDBOX_BASE_URL points to sandbox staging endpoint", () => {
    expect(SANDBOX_BASE_URL).toBe("https://thirdparty-sandbox.staging.qonto.co");
  });

  it("API_BASE_URL uses HTTPS", () => {
    expect(new URL(API_BASE_URL).protocol).toBe("https:");
  });

  it("SANDBOX_BASE_URL uses HTTPS", () => {
    expect(new URL(SANDBOX_BASE_URL).protocol).toBe("https:");
  });
});
