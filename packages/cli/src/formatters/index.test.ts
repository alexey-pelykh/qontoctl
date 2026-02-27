// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { formatOutput } from "./index.js";

describe("formatOutput", () => {
  const rows = [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ];

  it("routes to JSON formatter", () => {
    const result = formatOutput(rows, "json");
    expect(JSON.parse(result)).toEqual(rows);
  });

  it("routes to YAML formatter", () => {
    const result = formatOutput(rows, "yaml");
    expect(result).toContain("name: Alice");
  });

  it("routes to CSV formatter", () => {
    const result = formatOutput(rows, "csv");
    expect(result).toContain("name,age");
    expect(result).toContain("Alice,30");
  });

  it("routes to table formatter", () => {
    const result = formatOutput(rows, "table");
    expect(result).toContain("name");
    expect(result).toContain("Alice");
    expect(result).toContain("---");
  });
});
