// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { EInvoicingSettingsSchema } from "./einvoicing.schema.js";

describe("EInvoicingSettingsSchema", () => {
  const validSettings = {
    sending_status: "enabled",
    receiving_status: "disabled",
  };

  it("parses valid settings", () => {
    const result = EInvoicingSettingsSchema.parse(validSettings);
    expect(result).toEqual(validSettings);
  });

  it("strips unknown fields", () => {
    const result = EInvoicingSettingsSchema.parse({ ...validSettings, extra: true });
    expect(result).not.toHaveProperty("extra");
  });

  it("rejects missing required fields", () => {
    expect(() => EInvoicingSettingsSchema.parse({ sending_status: "enabled" })).toThrow();
  });
});
