// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { EInvoicingSettingsSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("e-invoicing CLI (e2e)", () => {
  pinAuthPreference("oauth-first");

  it("einvoicing settings displays settings in table format", () => {
    const output = cli("einvoicing", "settings");
    expect(output).toContain("sending_status");
    expect(output).toContain("receiving_status");
  });

  it("einvoicing settings --output json produces valid JSON with expected fields", () => {
    const output = cli("einvoicing", "settings", "--output", "json");
    const settings = JSON.parse(output) as Record<string, unknown>;
    EInvoicingSettingsSchema.parse(settings);
    expect(settings).toHaveProperty("sending_status");
    expect(settings).toHaveProperty("receiving_status");
    expect(typeof settings["sending_status"]).toBe("string");
    expect(typeof settings["receiving_status"]).toBe("string");
  });
});
