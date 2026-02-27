// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { formatCsv } from "./csv.js";

describe("formatCsv", () => {
  it("returns empty string for empty array", () => {
    expect(formatCsv([])).toBe("");
  });

  it("formats a single row with header", () => {
    const result = formatCsv([{ name: "Alice", age: 30 }]);
    const lines = result.split("\n");
    expect(lines[0]).toBe("name,age");
    expect(lines[1]).toBe("Alice,30");
  });

  it("formats multiple rows", () => {
    const result = formatCsv([
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("name,age");
    expect(lines[1]).toBe("Alice,30");
    expect(lines[2]).toBe("Bob,25");
  });

  it("escapes fields containing commas", () => {
    const result = formatCsv([{ note: "hello, world" }]);
    const lines = result.split("\n");
    expect(lines[1]).toBe('"hello, world"');
  });

  it("escapes fields containing double quotes", () => {
    const result = formatCsv([{ note: 'say "hello"' }]);
    const lines = result.split("\n");
    expect(lines[1]).toBe('"say ""hello"""');
  });

  it("escapes fields containing newlines", () => {
    const result = formatCsv([{ note: "line1\nline2" }]);
    const lines = result.split("\n");
    expect(lines[1]).toContain('"line1');
  });

  it("handles null and undefined values as empty strings", () => {
    const result = formatCsv([{ a: null, b: undefined, c: "ok" }]);
    const lines = result.split("\n");
    expect(lines[1]).toBe(",,ok");
  });

  it("serializes nested objects as JSON", () => {
    const result = formatCsv([{ data: { nested: true } }]);
    const lines = result.split("\n");
    expect(lines[1]).toContain("{");
  });

  it("produces empty cells for missing keys", () => {
    const result = formatCsv([{ a: 1, b: 2 }, { a: 3 } as Record<string, unknown>]);
    const lines = result.split("\n");
    expect(lines[2]).toBe("3,");
  });
});
