// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { TeamSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli, cliJson, SKIP, skipIfQontoStatus } from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

interface TeamItem {
  readonly id: string;
  readonly name: string;
}

describe.skipIf(!hasOAuthCredentials())("team CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

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

  describe("team create", () => {
    // Qonto's API has no DELETE endpoint for teams, so created teams persist
    // in the sandbox. We use a timestamped sentinel name so created teams are
    // easily identifiable. The Qonto sandbox is reset periodically, bounding
    // leakage.
    //
    // POST /v2/teams requires OAuth with the appropriate scope per the Qonto
    // auth table — api-key fallback is rejected with HTTP 401 ("OAuth2
    // authentication is required here"). When the configured OAuth client
    // lacks the team-management scope, both auth modes fail and we skip
    // rather than reporting a spurious failure.
    it("creates a team with a unique name (skips on OAuth scope gap)", () => {
      const teamName = `E2E Test Team ${String(Date.now())}`;
      const stdout = skipIfQontoStatus([401, 403], "--output", "json", "team", "create", "--name", teamName);
      if (stdout === SKIP) return;
      const parsed = JSON.parse(stdout) as TeamItem;
      TeamSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("name", teamName);
    });
  });
});
