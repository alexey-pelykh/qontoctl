// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { LabelSchema } from "./label.schema.js";

describe("LabelSchema", () => {
  const validLabel = {
    id: "label-1",
    name: "Marketing",
    parent_id: null,
  };

  it("parses a valid label", () => {
    const result = LabelSchema.parse(validLabel);
    expect(result).toEqual(validLabel);
  });

  it("parses a label with parent_id", () => {
    const result = LabelSchema.parse({ ...validLabel, parent_id: "label-0" });
    expect(result).toEqual({ ...validLabel, parent_id: "label-0" });
  });

  it("strips unknown fields", () => {
    const result = LabelSchema.parse({ ...validLabel, extra: true });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => LabelSchema.parse({ id: "label-1" })).toThrow();
  });

  it("accepts Label with parent_id omitted entirely (regression: L2 audit #604)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { parent_id: _omit, ...withoutParentId } = validLabel;
    const result = LabelSchema.parse(withoutParentId);
    expect(result.parent_id).toBeUndefined();
  });
});
