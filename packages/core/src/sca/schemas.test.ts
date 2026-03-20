// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ScaSessionSchema, ScaSessionStatusSchema } from "./schemas.js";

describe("ScaSessionStatusSchema", () => {
  it("accepts valid status values", () => {
    expect(ScaSessionStatusSchema.parse("waiting")).toBe("waiting");
    expect(ScaSessionStatusSchema.parse("allow")).toBe("allow");
    expect(ScaSessionStatusSchema.parse("deny")).toBe("deny");
  });

  it("rejects invalid status values", () => {
    expect(() => ScaSessionStatusSchema.parse("unknown")).toThrow(z.ZodError);
  });
});

describe("ScaSessionSchema", () => {
  const validSession = {
    token: "sca-token-123",
    status: "waiting" as const,
  };

  it("parses a valid SCA session", () => {
    const result = ScaSessionSchema.parse(validSession);
    expect(result).toEqual(validSession);
  });

  it("strips unknown fields", () => {
    const result = ScaSessionSchema.parse({ ...validSession, extra: "field" });
    expect(result).toEqual(validSession);
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects when required field is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token: _, ...withoutToken } = validSession;
    expect(() => ScaSessionSchema.parse(withoutToken)).toThrow(z.ZodError);
  });

  it("rejects invalid status value", () => {
    expect(() => ScaSessionSchema.parse({ ...validSession, status: "invalid" })).toThrow(z.ZodError);
  });
});
