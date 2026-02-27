// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { formatYaml } from "./yaml.js";

describe("formatYaml", () => {
  it("formats an object as YAML", () => {
    const result = formatYaml({ name: "Alice", age: 30 });
    expect(result).toContain("name: Alice");
    expect(result).toContain("age: 30");
  });

  it("formats an array of objects", () => {
    const result = formatYaml([{ id: 1 }, { id: 2 }]);
    expect(result).toContain("- id: 1");
    expect(result).toContain("- id: 2");
  });

  it("formats null as YAML", () => {
    const result = formatYaml(null);
    expect(result.trim()).toBe("null");
  });
});
