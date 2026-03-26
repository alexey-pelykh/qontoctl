// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { parseJson } from "./parse-json.js";

describe("parseJson", () => {
  it("parses valid JSON", () => {
    expect(parseJson('{"key":"value"}', "--body")).toEqual({ key: "value" });
  });

  it("parses valid JSON array", () => {
    expect(parseJson("[1,2,3]", "--body")).toEqual([1, 2, 3]);
  });

  it("throws user-friendly error for malformed JSON", () => {
    expect(() => parseJson("{invalid}", "--body")).toThrow("Invalid JSON for --body");
  });

  it("includes SyntaxError detail in error message", () => {
    try {
      parseJson("{invalid}", "--body");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/^Invalid JSON for --body: /);
    }
  });

  it("includes the context label in error message", () => {
    expect(() => parseJson("not-json", "--file data.json")).toThrow("Invalid JSON for --file data.json");
  });

  it("parses null, numbers, and strings", () => {
    expect(parseJson("null", "--body")).toBeNull();
    expect(parseJson("42", "--body")).toBe(42);
    expect(parseJson('"hello"', "--body")).toBe("hello");
  });
});
