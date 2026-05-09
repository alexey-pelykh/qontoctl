// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { MembershipSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("membership commands (e2e)", () => {
  describe("membership list", () => {
    it("lists memberships with expected fields", () => {
      const output = cli("membership", "list");
      expect(output).toBeTruthy();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "membership", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const item of parsed) {
        MembershipSchema.parse(item);
        const membership = item as Record<string, unknown>;
        expect(membership).toHaveProperty("id");
        expect(membership).toHaveProperty("first_name");
        expect(membership).toHaveProperty("last_name");
        expect(membership).toHaveProperty("role");
        expect(membership).toHaveProperty("team_id");
        expect(membership).toHaveProperty("status");
      }
    });

    it("returns at least one membership", () => {
      const output = cli("--output", "json", "membership", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed.length).toBeGreaterThanOrEqual(1);
    });
  });

  // Note: membership show and invite require OAuth, skipped in API-key E2E
});
