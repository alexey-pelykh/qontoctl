// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  IntlTransferRequirementFieldSchema,
  IntlTransferRequirementsSchema,
  IntlTransferRequirementsResponseSchema,
  IntlTransferSchema,
  IntlTransferResponseSchema,
} from "./schemas.js";

describe("IntlTransferRequirementFieldSchema", () => {
  const validField = {
    key: "reference",
    name: "Reference",
    type: "text",
  };

  it("accepts a valid requirement field", () => {
    const result = IntlTransferRequirementFieldSchema.parse(validField);
    expect(result.key).toBe("reference");
  });

  it("accepts optional fields", () => {
    const result = IntlTransferRequirementFieldSchema.parse({
      ...validField,
      example: "INV-001",
      validation_regexp: "^[A-Z0-9-]+$",
      min_length: 1,
      max_length: 50,
    });
    expect(result.example).toBe("INV-001");
    expect(result.max_length).toBe(50);
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlTransferRequirementFieldSchema.parse({ ...validField, extra: "field" });
    expect(result).toHaveProperty("extra", "field");
  });

  it("rejects missing required fields", () => {
    expect(() => IntlTransferRequirementFieldSchema.parse({ key: "k", name: "n" })).toThrow();
  });
});

describe("IntlTransferRequirementsSchema", () => {
  it("accepts valid requirements", () => {
    const result = IntlTransferRequirementsSchema.parse({
      fields: [{ key: "reference", name: "Reference", type: "text" }],
    });
    expect(result.fields).toHaveLength(1);
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlTransferRequirementsSchema.parse({
      fields: [],
      extra: "field",
    });
    expect(result).toHaveProperty("extra", "field");
  });
});

describe("IntlTransferRequirementsResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      requirements: {
        fields: [{ key: "reference", name: "Payment Reference", type: "text" }],
      },
    };
    const result = IntlTransferRequirementsResponseSchema.parse(response);
    expect(result.requirements.fields).toHaveLength(1);
  });
});

describe("IntlTransferSchema", () => {
  const validTransfer = {
    id: "intl-txn-1",
  };

  it("accepts a valid transfer", () => {
    const result = IntlTransferSchema.parse(validTransfer);
    expect(result.id).toBe("intl-txn-1");
  });

  it("preserves extra fields (loose schema)", () => {
    const result = IntlTransferSchema.parse({ ...validTransfer, status: "pending", extra: "field" });
    expect(result).toHaveProperty("extra", "field");
    expect(result).toHaveProperty("status", "pending");
  });

  it("rejects missing required fields", () => {
    expect(() => IntlTransferSchema.parse({})).toThrow();
  });
});

describe("IntlTransferResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      international_transfer: { id: "intl-txn-1" },
    };
    const result = IntlTransferResponseSchema.parse(response);
    expect(result.international_transfer.id).toBe("intl-txn-1");
  });
});
