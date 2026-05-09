// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { BeneficiarySchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("beneficiary commands (e2e)", () => {
  describe("beneficiary list", () => {
    it("lists beneficiaries with id, name, iban, status, trusted", () => {
      const output = cli("beneficiary", "list");
      expect(output).toBeTruthy();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "beneficiary", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const item of parsed) {
        const beneficiary = item as Record<string, unknown>;
        expect(beneficiary).toHaveProperty("id");
        expect(beneficiary).toHaveProperty("name");
        expect(beneficiary).toHaveProperty("iban");
        expect(beneficiary).toHaveProperty("status");
        expect(beneficiary).toHaveProperty("trusted");
      }
    });
  });

  describe("beneficiary show", () => {
    it("shows beneficiary details", () => {
      // First, get a beneficiary ID from the list
      const listOutput = cli("--output", "json", "beneficiary", "list");
      const beneficiaries = JSON.parse(listOutput) as { id: string }[];
      if (beneficiaries.length === 0) {
        return; // No beneficiaries — nothing to show
      }

      const first = beneficiaries[0];
      expect(first).toBeDefined();
      const beneficiaryId = (first as { id: string }).id;
      const output = cli("--output", "json", "beneficiary", "show", beneficiaryId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      BeneficiarySchema.parse(parsed);
      expect(parsed).toHaveProperty("id", beneficiaryId);
      expect(parsed).toHaveProperty("name");
      expect(parsed).toHaveProperty("iban");
      expect(parsed).toHaveProperty("bic");
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("trusted");
    });
  });
});
