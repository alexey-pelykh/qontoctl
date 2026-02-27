// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { formatJson } from "./json.js";

describe("formatJson", () => {
  it("formats an object as indented JSON", () => {
    const result = formatJson({ name: "Alice", age: 30 });
    expect(result).toBe('{\n  "name": "Alice",\n  "age": 30\n}');
  });

  it("formats an array of objects", () => {
    const result = formatJson([{ id: 1 }, { id: 2 }]);
    expect(JSON.parse(result)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("formats null", () => {
    expect(formatJson(null)).toBe("null");
  });

  it("formats a string", () => {
    expect(formatJson("hello")).toBe('"hello"');
  });
});
