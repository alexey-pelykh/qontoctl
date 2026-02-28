// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { isValidProfileName, validateConfig } from "./validate.js";

describe("validateConfig", () => {
  it("returns empty config for null input", () => {
    const result = validateConfig(null);
    expect(result.config).toEqual({});
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("returns empty config for undefined input", () => {
    const result = validateConfig(undefined);
    expect(result.config).toEqual({});
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("errors on non-object input", () => {
    const result = validateConfig("not an object");
    expect(result.errors).toContain("Configuration must be a YAML mapping");
  });

  it("errors on array input", () => {
    const result = validateConfig([1, 2, 3]);
    expect(result.errors).toContain("Configuration must be a YAML mapping");
  });

  it("warns on unknown top-level keys", () => {
    const result = validateConfig({ "unknown-key": "value", another: 42 });
    expect(result.warnings).toContain('Unknown configuration key: "unknown-key"');
    expect(result.warnings).toContain('Unknown configuration key: "another"');
    expect(result.errors).toEqual([]);
  });

  it("parses valid api-key section", () => {
    const result = validateConfig({
      "api-key": {
        "organization-slug": "my-org",
        "secret-key": "sk_test_123",
      },
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "my-org",
      secretKey: "sk_test_123",
    });
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("allows null api-key section", () => {
    const result = validateConfig({ "api-key": null });
    expect(result.config.apiKey).toBeUndefined();
    expect(result.errors).toEqual([]);
  });

  it("errors when api-key is not a mapping", () => {
    const result = validateConfig({ "api-key": "invalid" });
    expect(result.errors).toContain('"api-key" must be a mapping');
  });

  it("errors when api-key is an array", () => {
    const result = validateConfig({ "api-key": [1, 2] });
    expect(result.errors).toContain('"api-key" must be a mapping');
  });

  it("warns on unknown keys inside api-key", () => {
    const result = validateConfig({
      "api-key": {
        "organization-slug": "my-org",
        "secret-key": "sk_test_123",
        extra_field: "value",
      },
    });
    expect(result.warnings).toContain('Unknown key in "api-key": "extra_field"');
    expect(result.errors).toEqual([]);
    expect(result.config.apiKey).toBeDefined();
  });

  it("errors when organization-slug is not a string", () => {
    const result = validateConfig({
      "api-key": { "organization-slug": 123, "secret-key": "sk_test" },
    });
    expect(result.errors).toContain('"api-key.organization-slug" must be a string');
  });

  it("errors when secret-key is not a string", () => {
    const result = validateConfig({
      "api-key": { "organization-slug": "my-org", "secret-key": true },
    });
    expect(result.errors).toContain('"api-key.secret-key" must be a string');
  });

  it("allows partial api-key with only organization-slug", () => {
    const result = validateConfig({
      "api-key": { "organization-slug": "my-org" },
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "my-org",
      secretKey: "",
    });
    expect(result.errors).toEqual([]);
  });

  it("allows partial api-key with only secret-key", () => {
    const result = validateConfig({
      "api-key": { "secret-key": "sk_test" },
    });
    expect(result.config.apiKey).toEqual({
      organizationSlug: "",
      secretKey: "sk_test",
    });
    expect(result.errors).toEqual([]);
  });

  it("returns empty config for empty api-key mapping", () => {
    const result = validateConfig({ "api-key": {} });
    expect(result.config.apiKey).toBeUndefined();
    expect(result.errors).toEqual([]);
  });

  it("parses valid endpoint URL", () => {
    const result = validateConfig({ endpoint: "https://custom.example.com" });
    expect(result.config.endpoint).toBe("https://custom.example.com");
    expect(result.errors).toEqual([]);
  });

  it("errors when endpoint is not a string", () => {
    const result = validateConfig({ endpoint: 123 });
    expect(result.errors).toContain('"endpoint" must be a string');
  });

  it("errors when endpoint is not a valid URL", () => {
    const result = validateConfig({ endpoint: "not-a-url" });
    expect(result.errors).toContain('"endpoint" must be a valid URL');
  });

  it("allows null endpoint", () => {
    const result = validateConfig({ endpoint: null });
    expect(result.config.endpoint).toBeUndefined();
    expect(result.errors).toEqual([]);
  });

  it("parses sandbox boolean true", () => {
    const result = validateConfig({ sandbox: true });
    expect(result.config.sandbox).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("parses sandbox boolean false", () => {
    const result = validateConfig({ sandbox: false });
    expect(result.config.sandbox).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it("errors when sandbox is not a boolean", () => {
    const result = validateConfig({ sandbox: "yes" });
    expect(result.errors).toContain('"sandbox" must be a boolean');
  });

  it("allows null sandbox", () => {
    const result = validateConfig({ sandbox: null });
    expect(result.config.sandbox).toBeUndefined();
    expect(result.errors).toEqual([]);
  });
});

describe("isValidProfileName", () => {
  it("accepts simple alphanumeric names", () => {
    expect(isValidProfileName("default")).toBe(true);
    expect(isValidProfileName("my-profile")).toBe(true);
    expect(isValidProfileName("profile_123")).toBe(true);
  });

  it("rejects names with forward slashes", () => {
    expect(isValidProfileName("path/traversal")).toBe(false);
  });

  it("rejects names with backslashes", () => {
    expect(isValidProfileName("path\\traversal")).toBe(false);
  });

  it("rejects names with parent directory references", () => {
    expect(isValidProfileName("..")).toBe(false);
    expect(isValidProfileName("..secret")).toBe(false);
  });

  it("accepts names with single dots", () => {
    expect(isValidProfileName("my.profile")).toBe(true);
  });
});
