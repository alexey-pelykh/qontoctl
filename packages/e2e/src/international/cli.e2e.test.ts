// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { IntlCurrencySchema, IntlEligibilitySchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli, cliJson } from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

interface IntlCurrencyItem {
  readonly country_code: string;
  readonly currency_code: string;
  readonly suggestion_priority?: number;
}

describe.skipIf(!hasOAuthCredentials())("international CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("intl eligibility", () => {
    it("returns eligibility status with default output", () => {
      const output = cli("intl", "eligibility");
      expect(output).toBeDefined();
    });

    it("returns eligibility as JSON matching the (flat) schema", () => {
      const parsed = cliJson<{ status: string; reason?: string }>("intl", "eligibility");
      IntlEligibilitySchema.parse(parsed);
      expect(parsed).toHaveProperty("status");
      expect(typeof parsed.status).toBe("string");
    });
  });

  describe("intl currencies", () => {
    it("lists currencies with default output (default --source EUR)", () => {
      const output = cli("intl", "currencies");
      expect(output).toBeDefined();
    });

    it("returns currencies as JSON with country_code/currency_code shape", () => {
      const parsed = cliJson<IntlCurrencyItem[]>("intl", "currencies", "--source", "EUR");
      expect(Array.isArray(parsed)).toBe(true);
      const first = parsed[0];
      if (first !== undefined) {
        IntlCurrencySchema.parse(first);
        expect(first).toHaveProperty("currency_code");
        expect(first).toHaveProperty("country_code");
      }
    });

    it("supports --search filter on currency_code", () => {
      const parsed = cliJson<IntlCurrencyItem[]>("intl", "currencies", "--source", "EUR", "--search", "USD");
      expect(Array.isArray(parsed)).toBe(true);
      for (const c of parsed) {
        const match = c.currency_code.toLowerCase().includes("usd") || c.country_code.toLowerCase().includes("usd");
        expect(match).toBe(true);
      }
    });

    it("outputs CSV format", () => {
      const output = cli("intl", "currencies", "--source", "EUR", "--output", "csv");
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const header = lines[0] ?? "";
      expect(header).toContain("currency_code");
    });
  });
});
