// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { IntlEligibilitySchema, IntlCurrencySchema } from "@qontoctl/core";
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

interface IntlCurrencyItem {
  readonly code: string;
  readonly name: string;
}

describe.skipIf(!hasCredentials())("international CLI commands (e2e)", () => {
  describe("intl eligibility", () => {
    it("returns eligibility status with default output", () => {
      const output = cli("intl", "eligibility");
      expect(output).toBeDefined();
    });

    it("returns eligibility as JSON", () => {
      const parsed = cliJson<{ eligible: boolean; reason?: string }>("intl", "eligibility");
      IntlEligibilitySchema.parse(parsed);
      expect(parsed).toHaveProperty("eligible");
      expect(typeof parsed.eligible).toBe("boolean");
    });
  });

  describe("intl currencies", () => {
    it("lists currencies with default output", () => {
      const output = cli("intl", "currencies");
      expect(output).toBeDefined();
    });

    it("returns currencies as JSON", () => {
      const parsed = cliJson<IntlCurrencyItem[]>("intl", "currencies");
      expect(Array.isArray(parsed)).toBe(true);
      const first = parsed[0];
      if (first !== undefined) {
        IntlCurrencySchema.parse(first);
        expect(first).toHaveProperty("code");
        expect(first).toHaveProperty("name");
      }
    });

    it("supports --search filter", () => {
      const parsed = cliJson<IntlCurrencyItem[]>("intl", "currencies", "--search", "USD");
      expect(Array.isArray(parsed)).toBe(true);
      for (const c of parsed) {
        const match = c.code.toLowerCase().includes("usd") || c.name.toLowerCase().includes("usd");
        expect(match).toBe(true);
      }
    });

    it("outputs CSV format", () => {
      const output = cli("intl", "currencies", "--output", "csv");
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const header = lines[0] ?? "";
      expect(header).toContain("code");
    });
  });
});
