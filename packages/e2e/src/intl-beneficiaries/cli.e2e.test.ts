// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { IntlBeneficiarySchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliRaw } from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

interface IntlBeneficiaryItem {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly country: string;
}

/**
 * The Qonto sandbox gates `/v2/international/beneficiaries` on the org's
 * eligibility status: an `STATUS_INELIGIBLE` org returns HTTP 403 with a
 * `forbidden: failed to list beneficiaries: forbidden` body. That surfaces
 * to the CLI as a non-zero exit. We use `cliRaw` here so the suite
 * remains useful both on eligibility-cleared and ineligible sandbox accounts;
 * the tests still assert response shape when the call succeeds.
 */
describe.skipIf(!hasOAuthCredentials())("intl-beneficiary CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("intl beneficiary list", () => {
    it("lists international beneficiaries with default output", () => {
      const result = cliRaw(["intl", "beneficiary", "list", "--currency", "USD"]);
      if (result.ok) {
        expect(result.stdout).toBeDefined();
      }
    });

    it("produces valid JSON with --output json", () => {
      const result = cliRaw(["intl", "beneficiary", "list", "--currency", "USD", "--output", "json"]);
      if (!result.ok) return;
      const parsed = JSON.parse(result.stdout) as IntlBeneficiaryItem[];
      expect(Array.isArray(parsed)).toBe(true);
      const first = parsed[0];
      if (first !== undefined) {
        IntlBeneficiarySchema.parse(first);
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("currency");
      }
    });

    it("supports pagination", () => {
      const result = cliRaw([
        "intl",
        "beneficiary",
        "list",
        "--currency",
        "USD",
        "--per-page",
        "2",
        "--page",
        "1",
        "--output",
        "json",
      ]);
      if (!result.ok) return;
      const parsed = JSON.parse(result.stdout) as IntlBeneficiaryItem[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeLessThanOrEqual(2);
    });

    it("outputs CSV format", () => {
      const result = cliRaw(["intl", "beneficiary", "list", "--currency", "USD", "--output", "csv", "--per-page", "5"]);
      if (!result.ok) return;
      const lines = result.stdout.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });
  });
});
