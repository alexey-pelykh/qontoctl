// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { TeamSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli, cliJson } from "../helpers.js";
import { hasOAuthCredentials } from "../sandbox.js";

interface TeamItem {
  readonly id: string;
  readonly name: string;
}

describe.skipIf(!hasOAuthCredentials())("team CLI commands (e2e)", () => {
  describe("team list", () => {
    it("lists teams with default output", () => {
      const output = cli("team", "list");
      expect(output).toBeDefined();
    });

    it("lists teams as JSON", () => {
      const teams = cliJson<TeamItem[]>("team", "list");
      expect(Array.isArray(teams)).toBe(true);
      const first = teams[0];
      if (first !== undefined) {
        TeamSchema.parse(first);
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("name");
      }
    });

    it("supports pagination", () => {
      const teams = cliJson<TeamItem[]>("team", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(teams)).toBe(true);
      expect(teams.length).toBeLessThanOrEqual(2);
    });

    it("outputs CSV format", () => {
      const output = cli("team", "list", "--output", "csv");
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const header = lines[0] ?? "";
      expect(header).toContain("id");
    });
  });
});
