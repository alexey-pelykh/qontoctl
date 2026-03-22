// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { MembershipSchema } from "./membership.schema.js";

describe("MembershipSchema", () => {
  const validMembership = {
    id: "member-1",
    first_name: "John",
    last_name: "Doe",
    email: "john@example.com",
    role: "admin" as const,
    team_id: "team-1",
    residence_country: "FR",
    birthdate: "1990-01-01",
    nationality: "FR",
    birth_country: "FR",
    ubo: false,
    status: "active",
  };

  it("parses a valid membership", () => {
    const result = MembershipSchema.parse(validMembership);
    expect(result).toEqual(validMembership);
  });

  it("parses with nullable fields set to null", () => {
    const result = MembershipSchema.parse({
      ...validMembership,
      residence_country: null,
      birthdate: null,
      nationality: null,
      birth_country: null,
      ubo: null,
    });
    expect(result.residence_country).toBeNull();
    expect(result.birthdate).toBeNull();
    expect(result.nationality).toBeNull();
    expect(result.birth_country).toBeNull();
    expect(result.ubo).toBeNull();
  });

  it("validates role enum values", () => {
    for (const role of ["owner", "admin", "manager", "reporting", "employee", "accountant"]) {
      expect(() => MembershipSchema.parse({ ...validMembership, role })).not.toThrow();
    }
    expect(() => MembershipSchema.parse({ ...validMembership, role: "superadmin" })).toThrow();
  });

  it("strips unknown fields", () => {
    const result = MembershipSchema.parse({ ...validMembership, extra: true });
    expect(result).not.toHaveProperty("extra");
  });

  it("accepts missing optional fields (API omits them)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { email: _, residence_country: _2, birthdate: _3, nationality: _4, birth_country: _5, ubo: _6, ...input } =
      validMembership;
    const result = MembershipSchema.parse(input);
    expect(result.email).toBeUndefined();
    expect(result.residence_country).toBeUndefined();
    expect(result.birthdate).toBeUndefined();
    expect(result.nationality).toBeUndefined();
    expect(result.birth_country).toBeUndefined();
    expect(result.ubo).toBeUndefined();
  });

  it("rejects missing required fields", () => {
    expect(() => MembershipSchema.parse({ id: "member-1" })).toThrow();
  });
});
