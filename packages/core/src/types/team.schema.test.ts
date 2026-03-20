// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { TeamSchema } from "./team.schema.js";

describe("TeamSchema", () => {
  const validTeam = {
    id: "team-1",
    name: "Engineering",
  };

  it("parses a valid team", () => {
    const result = TeamSchema.parse(validTeam);
    expect(result).toEqual(validTeam);
  });

  it("strips unknown fields", () => {
    const result = TeamSchema.parse({ ...validTeam, extra: true });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => TeamSchema.parse({ id: "team-1" })).toThrow();
  });
});
