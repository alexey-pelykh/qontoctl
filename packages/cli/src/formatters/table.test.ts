// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { formatTable } from "./table.js";

describe("formatTable", () => {
  it("returns empty string for empty array", () => {
    expect(formatTable([])).toBe("");
  });

  it("formats a single row with aligned columns", () => {
    const result = formatTable([{ name: "Alice", age: 30 }]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3); // header, separator, data
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("age");
    expect(lines[1]).toMatch(/^-+\s+-+$/);
    expect(lines[2]).toContain("Alice");
    expect(lines[2]).toContain("30");
  });

  it("pads shorter values to column width", () => {
    const result = formatTable([
      { name: "Alice", city: "Paris" },
      { name: "Bob", city: "Amsterdam" },
    ]);
    const lines = result.split("\n");
    // "Amsterdam" is 9 chars, "Paris" should be padded to 9
    expect(lines[2]).toContain("Alice");
    expect(lines[3]).toContain("Bob");
    // Check alignment: all "city" values start at the same column
    const header = lines[0] ?? "";
    const row1 = lines[2] ?? "";
    const row2 = lines[3] ?? "";
    const headerCityIdx = header.indexOf("city");
    const row1CityIdx = row1.indexOf("Paris");
    const row2CityIdx = row2.indexOf("Amsterdam");
    expect(row1CityIdx).toBe(headerCityIdx);
    expect(row2CityIdx).toBe(headerCityIdx);
  });

  it("handles null and undefined as empty strings", () => {
    const result = formatTable([{ a: null, b: undefined, c: "ok" }]);
    const lines = result.split("\n");
    expect(lines[2]).toContain("ok");
  });

  it("serializes nested objects as JSON", () => {
    const result = formatTable([{ data: { nested: true } }]);
    const lines = result.split("\n");
    expect(lines[2]).toContain('{"nested":true}');
  });

  it("widens columns to fit header names", () => {
    const result = formatTable([{ longheadername: "x" }]);
    const lines = result.split("\n");
    // Separator should be at least as wide as the header
    const separator = lines[1] ?? "";
    expect(separator.length).toBeGreaterThanOrEqual("longheadername".length);
  });
});
