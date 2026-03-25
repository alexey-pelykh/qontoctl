// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { TeamSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    cwd: cliCwd(),
    timeout: 30_000,
  });
}

function cliJson<T>(...args: string[]): T {
  const output = cli(...args, "--output", "json");
  return JSON.parse(output) as T;
}

interface TeamItem {
  readonly id: string;
  readonly name: string;
}

describe.skipIf(!hasCredentials())("team CLI commands (e2e)", () => {
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
