// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, expect, it } from "vitest";
import { cli, cliJson } from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("intl-transfer CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("intl-transfer requirements", () => {
    it("returns requirements for a beneficiary", () => {
      // First list intl beneficiaries to get an ID
      let beneficiaries: { id: string }[];
      try {
        beneficiaries = cliJson<{ id: string }[]>("intl-beneficiary", "list");
      } catch {
        return;
      }
      if (beneficiaries.length === 0) return;

      const id = (beneficiaries[0] as { id: string }).id;
      const output = cli("--output", "json", "intl-transfer", "requirements", id);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("requirements");
    });
  });
});
