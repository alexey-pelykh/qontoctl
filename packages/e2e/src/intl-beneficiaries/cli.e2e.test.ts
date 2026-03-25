// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { IntlBeneficiarySchema } from "@qontoctl/core";
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

interface IntlBeneficiaryItem {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly country: string;
}

describe.skipIf(!hasCredentials())("intl-beneficiary CLI commands (e2e)", () => {
  describe("intl-beneficiary list", () => {
    it("lists international beneficiaries with default output", () => {
      const output = cli("intl-beneficiary", "list");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const parsed = cliJson<IntlBeneficiaryItem[]>("intl-beneficiary", "list");
      expect(Array.isArray(parsed)).toBe(true);
      const first = parsed[0];
      if (first !== undefined) {
        IntlBeneficiarySchema.parse(first);
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("currency");
      }
    });

    it("supports pagination", () => {
      const parsed = cliJson<IntlBeneficiaryItem[]>("intl-beneficiary", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeLessThanOrEqual(2);
    });

    it("outputs CSV format", () => {
      const output = cli("intl-beneficiary", "list", "--output", "csv", "--per-page", "5");
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });
  });
});
