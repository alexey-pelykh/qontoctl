// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { CardSchema } from "@qontoctl/core";
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

interface CardItem {
  readonly id: string;
  readonly nickname: string | null;
  readonly last_digits: string | null;
  readonly status: string;
  readonly card_level: string;
  readonly holder_id: string;
}

describe.skipIf(!hasCredentials())("card CLI commands (e2e)", () => {
  describe("card list", () => {
    it("lists cards with default output", () => {
      const output = cli("card", "list");
      expect(output).toBeDefined();
    });

    it("lists cards as JSON", () => {
      const cards = cliJson<CardItem[]>("card", "list");
      expect(Array.isArray(cards)).toBe(true);
      const first = cards[0];
      if (first !== undefined) {
        CardSchema.parse(first);
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("status");
        expect(first).toHaveProperty("card_level");
      }
    });

    it("supports pagination", () => {
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(cards)).toBe(true);
      expect(cards.length).toBeLessThanOrEqual(2);
    });

    it("filters by status", () => {
      const cards = cliJson<CardItem[]>("card", "list", "--status", "live");
      expect(Array.isArray(cards)).toBe(true);
      for (const c of cards) {
        expect(c.status).toBe("live");
      }
    });

    it("filters by card level", () => {
      const cards = cliJson<CardItem[]>("card", "list", "--card-level", "virtual");
      expect(Array.isArray(cards)).toBe(true);
      for (const c of cards) {
        expect(c.card_level).toBe("virtual");
      }
    });

    it("outputs CSV format", () => {
      const output = cli("card", "list", "--output", "csv", "--per-page", "5");
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const header = lines[0] ?? "";
      expect(header).toContain("id");
      expect(header).toContain("status");
    });

    it("outputs YAML format", () => {
      const output = cli("card", "list", "--output", "yaml", "--per-page", "2");
      expect(output).toContain("id:");
    });
  });
});
